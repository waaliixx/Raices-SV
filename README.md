# Raíces SV — Plataforma de ecoturismo local

Incluye interfaz web adaptable/PWA, catálogo, solicitudes de reserva offline-first con IndexedDB, administración de experiencias, API REST en Rust y persistencia JSON en Apache CouchDB.

## Integrantes
HERRERA DÍAZ, JAVIER ANTONIO			HD25004.<br>
ROSALES MORAN, JOSE LUIS				RM22065.<br>
GUILLEN HENRIQUEZ, CRISTIAN OSWALDO	    GH24026.<br>
RIVAS MONROY, EDEN VLADIMIR			    RM24016.<br>
VASQUEZ CORVERA, WALTER IVAN			VC25012.<br>

## Requisitos
Docker Desktop con Docker Compose v2. Para el frontend sin Docker: Node.js 20+; para la API sin Docker: Rust (cargo).

## Instalación (Windows PowerShell)
```powershell
cd ecoturismo-app
Copy-Item .env.example .env
# Abrí .env y cambiá las dos claves antes de usarlo
 docker compose up --build -d
```
- **App:** http://localhost:3000
- **API:** http://localhost:8080/api/health
- **CouchDB:** http://localhost:5984/_utils/ (solo escucha en localhost)
- **Panel administrativo:** pestaña *Para anfitriones*, con el valor de `ADMIN_KEY` en `.env`.

La primera compilación Docker de Rust puede requerir varios minutos. En caso de actualizar código: `docker compose up --build -d`.

### Desarrollo frontend
```bash
cd frontend
npm install
npm run dev
```
Se requiere levantar API+CouchDB previamente (`docker compose up -d couchdb api`). El frontend de Vite se sirve en http://localhost:5173 y redirige `/api` a la API local.

## Probar el modo sin conexión
1. Abrí la web una vez conectado y visitá el catálogo para guardar datos y recursos en caché.
2. En DevTools del navegador, activá **Offline** en Network (no basta con apagar solo la conexión del servidor).
3. Creá una solicitud: se almacena en IndexedDB y aparece como pendiente.
4. Restaurá la conexión y usá **Reintentar envío**; el servidor comprueba capacidad y evita reservas duplicadas.
5. Si los cupos se agotaron, el servidor rechaza la solicitud; **una solicitud local no significa reserva confirmada**.

## Pruebas
```bash
docker compose --profile pruebas run --rm k6
```
Para prueba concurrente de cupos, ejecutar por separado:
```bash
docker run --rm --network ecoturismo-app_default -v "${PWD}/tests:/scripts" -e API_URL=http://api:8080 grafana/k6:0.54.0 run /scripts/reservas.js
```
(Ajustá el nombre de red si Docker Compose asignó otro nombre). Estas pruebas producen **datos de laboratorio**, no resultados preestablecidos.

## Alcance y limitaciones
- Los seis apartados metodológicos están trazados en [docs/FASES.md](docs/FASES.md).
- **Funcional:** experiencias, disponibilidad por fecha, registro y reintento de solicitudes, cupos resistentes a concurrencia, panel con clave, métricas básicas, Docker, guiones de carga.
- **Pendiente:** integración de pagos reales, usuarios/roles completos, replicación distribuida automática entre nodos CouchDB, cifrado de datos sensibles en IndexedDB, arquitectura monolítica comparativa, estrés de red reproducible y reporte final APA 7.
- **Importante:** prototipo para desarrollo local; no desplegar públicamente sin seguridad adicional. El cliente almacena nombre y correo sin cifrado local y las claves de ejemplo deben cambiarse.
- El catálogo inicial contiene **datos demostrativos ficticios**, no negocios reales ni disponibilidad comercial verificada.

## Arquitectura
```
Navegador TypeScript / PWA
  ├── caché Service Worker (recursos)
  ├── IndexedDB (cola de solicitudes sin conexión)
  └── /api REST (HTTPS en producción)
              │
          Rust / Axum
   reglas de capacidad, validación,
   idempotencia, administración
              │ HTTP + JSON
        Apache CouchDB
    experiencias + cupos por fecha
```

## Observación experimental
El diseño de cupos usa un único documento con control optimista por revisión para una experiencia y fecha. Es adecuado para el MVP local, pero debe diseñarse un protocolo de autoridad/reconciliación antes de permitir escrituras multi-nodo a cupos replicados, porque CouchDB no resuelve automáticamente sobreventas globales.
