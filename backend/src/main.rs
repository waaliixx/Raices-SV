use axum::{extract::{Path, State}, http::{HeaderMap, StatusCode}, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, sync::{Arc, atomic::{AtomicU64, Ordering}}, time::{Duration, Instant}};
use tower_http::{cors::{Any, CorsLayer}, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    http: reqwest::Client,
    url: String,
    user: String,
    pass: String,
    admin_key: String,
    requests: Arc<AtomicU64>,
    errors: Arc<AtomicU64>,
    latency_ms: Arc<AtomicU64>,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<Value>)>;
fn err(code: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (code, Json(json!({"error":message})))
}

fn require_admin(headers: &HeaderMap, s: &AppState) -> Result<(), (StatusCode, Json<Value>)> {
    let given = headers.get("x-admin-key").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !s.admin_key.is_empty() && given == s.admin_key { Ok(()) } else { Err(err(StatusCode::UNAUTHORIZED, "Clave de administración inválida")) }
}

async fn couch(s: &AppState, method: reqwest::Method, path: &str, body: Option<Value>) -> Result<(StatusCode, Value), (StatusCode, Json<Value>)> {
    let mut request = s.http.request(method, format!("{}{}", s.url, path)).basic_auth(&s.user, Some(&s.pass));
    if let Some(v) = body { request = request.json(&v); }
    let res = request.send().await.map_err(|_| err(StatusCode::SERVICE_UNAVAILABLE, "CouchDB no disponible"))?;
    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let value = res.json::<Value>().await.unwrap_or(json!({}));
    Ok((status, value))
}

async fn initialize(s: &AppState) {
    for db in ["experiencias", "cupos"] {
        for attempt in 0..30 {
            if let Ok((code, _)) = couch(s, reqwest::Method::PUT, &format!("/{db}"), None).await {
                if code.is_success() || code == StatusCode::PRECONDITION_FAILED { break; }
            }
            if attempt == 29 { tracing::error!("No se pudo preparar base {db}"); }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
    for (id, title, place, kind, cost, capacity, description, accent) in [
        ("ruta-flores", "Senderos de la Ruta de las Flores", "Apaneca, Ahuachapán", "Senderismo", 18, 12, "Un recorrido entre cafetales, miradores y naturaleza.", "forest"),
        ("cabana-niebla", "Cabaña entre las nubes", "Concepción de Ataco, Ahuachapán", "Alojamiento", 85, 4, "Descansá rodeado de montañas y aire fresco.", "mist"),
        ("cascadas", "Aventura en cascadas", "Juayúa, Sonsonate", "Aventura", 28, 10, "Caminata guiada hacia pozas y cascadas.", "water"),
        ("boqueron", "Miradores del Boquerón", "San Salvador", "Naturaleza", 15, 15, "Conocé paisajes volcánicos con un guía local.", "sunset"),
        ("campamento", "Noche bajo las estrellas", "Santa Ana", "Camping", 45, 8, "Una experiencia para conectar con el bosque.", "night"),
        ("manglares", "Ruta de manglares", "La Libertad", "Ecoturismo", 25, 6, "Conocé ecosistemas costeros y su biodiversidad.", "coast"),
    ] {
        let doc = json!({"_id":id,"type":"experiencia","title":title,"place":place,"kind":kind,"price":cost,"capacity":capacity,"description":description,"accent":accent});
        let _ = couch(s, reqwest::Method::PUT, &format!("/experiencias/{id}"), Some(doc)).await;
    }
}
async fn health(State(s): State<AppState>) -> ApiResult<Value> {
    let (status, _) = couch(&s, reqwest::Method::GET, "/_up", None).await?;
    if status.is_success() { Ok(Json(json!({"ok":true,"database":"connected"}))) }
    else { Err(err(StatusCode::SERVICE_UNAVAILABLE, "Base de datos no lista")) }
}
async fn experiences(State(s): State<AppState>) -> ApiResult<Value> {
    let (_, v) = couch(&s, reqwest::Method::GET, "/experiencias/_all_docs?include_docs=true", None).await?;
    let docs: Vec<Value> = v["rows"].as_array().into_iter().flatten().filter_map(|r| r.get("doc").cloned()).filter(|d| d["type"]=="experiencia").collect();
    Ok(Json(json!(docs)))
}
#[derive(Deserialize)]
struct ExperienceInput { title:String, place:String, kind:String, price:f64, capacity:u32, description:String }
async fn create_experience(State(s):State<AppState>, headers:HeaderMap, Json(input):Json<ExperienceInput>) -> ApiResult<Value> {
    require_admin(&headers, &s)?;
    if input.title.trim().len()<3 || input.capacity==0 || input.price<0.0 || !input.price.is_finite() || input.kind.trim().is_empty() || input.place.trim().is_empty() { return Err(err(StatusCode::BAD_REQUEST,"Datos de experiencia inválidos")); }
    let id = format!("exp-{}", chrono::Utc::now().timestamp_micros());
    let doc = json!({"_id":id,"type":"experiencia","title":input.title,"place":input.place,"kind":input.kind,"price":input.price,"capacity":input.capacity,"description":input.description,"accent":"forest"});
    let (code, _) = couch(&s,reqwest::Method::PUT,&format!("/experiencias/{id}"),Some(doc.clone())).await?;
    if !code.is_success() { return Err(err(StatusCode::BAD_GATEWAY,"No se pudo guardar")); }
    Ok(Json(doc))
}
#[derive(Deserialize)]
struct BookingInput { experience_id:String, date:String, people:u32, name:String, email:String, idempotency_key:String }
#[derive(Serialize, Deserialize, Clone)]
struct Booking { id:String, experience_id:String, title:String, date:String, people:u32, name:String, email:String, status:String, created_at:String }
fn valid_key(s:&str)->bool { s.len()>=8 && s.len()<=100 && s.chars().all(|c| c.is_ascii_alphanumeric() || c=='-') }
async fn reserve(State(s):State<AppState>, Json(input):Json<BookingInput>) -> ApiResult<Value> {
    if !valid_key(&input.idempotency_key) || input.people==0 || input.people>30 || input.name.trim().len()<2 || !input.email.contains('@') || chrono::NaiveDate::parse_from_str(&input.date,"%Y-%m-%d").is_err() || !valid_key(&input.experience_id) {
        return Err(err(StatusCode::BAD_REQUEST,"Verificá los datos de la reserva"));
    }
    if let Ok(day) = chrono::NaiveDate::parse_from_str(&input.date, "%Y-%m-%d") {
        if day < chrono::Utc::now().date_naive() { return Err(err(StatusCode::BAD_REQUEST,"Elegí una fecha actual o futura")); }
    }
    let (code, exp) = couch(&s, reqwest::Method::GET, &format!("/experiencias/{}", input.experience_id), None).await?;
    if !code.is_success() { return Err(err(StatusCode::NOT_FOUND,"Experiencia no encontrada")); }
    let capacity=exp["capacity"].as_u64().unwrap_or(0);
    let title=exp["title"].as_str().unwrap_or("Experiencia").to_string();
    let slot_id = format!("slot-{}-{}",input.experience_id,input.date);
    for _ in 0..12 {
        let (status, old)=couch(&s,reqwest::Method::GET,&format!("/cupos/{slot_id}"),None).await?;
        let mut doc = if status==StatusCode::NOT_FOUND {json!({"_id":slot_id,"type":"cupo","experience_id":input.experience_id,"date":input.date,"bookings":[]})} else if status.is_success() {old} else {return Err(err(StatusCode::BAD_GATEWAY,"No se pudo consultar disponibilidad"));};
        let mut bookings:Vec<Booking>=serde_json::from_value(doc["bookings"].clone()).unwrap_or_default();
        if let Some(existing)=bookings.iter().find(|b|b.id==input.idempotency_key) {return Ok(Json(json!({"booking":existing,"remaining":capacity.saturating_sub(bookings.iter().map(|b|b.people as u64).sum::<u64>())})));}
        let used:u64=bookings.iter().map(|b|b.people as u64).sum();
        if used + input.people as u64 > capacity {return Err(err(StatusCode::CONFLICT,"No hay cupos suficientes para esta fecha"));}
        let b=Booking{id:input.idempotency_key.clone(),experience_id:input.experience_id.clone(),title:title.clone(),date:input.date.clone(),people:input.people,name:input.name.trim().to_owned(),email:input.email.trim().to_owned(),status:"confirmada-sin-pago".into(),created_at:chrono::Utc::now().to_rfc3339()};
        bookings.push(b.clone());
        doc["bookings"]=json!(bookings);
        let (put,_) = couch(&s,reqwest::Method::PUT,&format!("/cupos/{slot_id}"),Some(doc)).await?;
        if put.is_success() { return Ok(Json(json!({"booking":b,"remaining":capacity-used-input.people as u64}))); }
        if put!=StatusCode::CONFLICT {return Err(err(StatusCode::BAD_GATEWAY,"No se pudo confirmar reserva"));}
    }
    Err(err(StatusCode::CONFLICT,"Demasiadas reservas simultáneas. Intentá nuevamente"))
}
async fn availability(State(s):State<AppState>,Path((id,date)):Path<(String,String)>) -> ApiResult<Value> {
    if !valid_key(&id) || chrono::NaiveDate::parse_from_str(&date,"%Y-%m-%d").is_err() {return Err(err(StatusCode::BAD_REQUEST,"Parámetros inválidos"));}
    let (status, exp)=couch(&s,reqwest::Method::GET,&format!("/experiencias/{id}"),None).await?;
    if !status.is_success() {return Err(err(StatusCode::NOT_FOUND,"Experiencia no encontrada"));}
    let capacity=exp["capacity"].as_u64().unwrap_or(0);
    let (_,doc)=couch(&s,reqwest::Method::GET,&format!("/cupos/slot-{id}-{date}"),None).await?;
    let used:u64=doc["bookings"].as_array().into_iter().flatten().map(|b|b["people"].as_u64().unwrap_or(0)).sum();
    Ok(Json(json!({"capacity":capacity,"used":used,"remaining":capacity.saturating_sub(used)})))
}
async fn reservations(State(s):State<AppState>,headers:HeaderMap)->ApiResult<Value> {
    require_admin(&headers,&s)?;
    let (code,docs)=couch(&s,reqwest::Method::GET,"/cupos/_all_docs?include_docs=true",None).await?;
    if !code.is_success() {return Err(err(StatusCode::BAD_GATEWAY,"No se pudieron leer reservas"));}
    let bookings:Vec<Value>=docs["rows"].as_array().into_iter().flatten().flat_map(|r|r["doc"]["bookings"].as_array().cloned().unwrap_or_default()).collect();
    Ok(Json(json!(bookings)))
}
async fn metrics(State(s):State<AppState>,headers:HeaderMap)->ApiResult<Value> {
    require_admin(&headers,&s)?;
    let total=s.requests.load(Ordering::Relaxed);
    Ok(Json(json!({"requests":total,"errors":s.errors.load(Ordering::Relaxed),"average_api_latency_ms":if total>0{s.latency_ms.load(Ordering::Relaxed)/total}else{0},"note":"Métricas de este proceso, no del sistema completo"})))
}
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info,tower_http=info").init();
    let state=AppState{http:reqwest::Client::builder().timeout(Duration::from_secs(8)).build().unwrap(),url:env::var("COUCHDB_URL").unwrap_or("http://localhost:5984".into()),user:env::var("COUCHDB_USER").unwrap_or("admin".into()),pass:env::var("COUCHDB_PASSWORD").unwrap_or_default(),admin_key:env::var("ADMIN_KEY").unwrap_or_default(),requests:Arc::new(AtomicU64::new(0)),errors:Arc::new(AtomicU64::new(0)),latency_ms:Arc::new(AtomicU64::new(0))};
    initialize(&state).await;
    let stats=state.clone();
    let app=Router::new().route("/api/health",get(health)).route("/api/experiences",get(experiences).post(create_experience)).route("/api/availability/:id/:date",get(availability)).route("/api/reservations",post(reserve).get(reservations)).route("/api/metrics",get(metrics)).with_state(state).layer(axum::middleware::from_fn(move |req: axum::extract::Request, next: axum::middleware::Next|{let stats=stats.clone();async move{let start=Instant::now();let res=next.run(req).await;stats.requests.fetch_add(1,Ordering::Relaxed);stats.latency_ms.fetch_add(start.elapsed().as_millis() as u64,Ordering::Relaxed);if res.status().is_server_error(){stats.errors.fetch_add(1,Ordering::Relaxed);}res}})).layer(TraceLayer::new_for_http()).layer(CorsLayer::new().allow_origin(Any).allow_headers(Any).allow_methods(Any));
    let port=env::var("PORT").unwrap_or("8080".into());
    let socket=tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.unwrap();
    tracing::info!("API escuchando en {port}");
    axum::serve(socket,app).await.unwrap();
}
