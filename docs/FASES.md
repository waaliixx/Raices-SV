# Correspondencia con las seis fases académicas

**Proyecto:** Plataforma de reservas y experiencias para micronegocios de ecoturismo local.

## Fase 1. Definición y delimitación
- Problema: registro informal, conectividad intermitente, riesgos de sobreventa.
- Alcance del MVP: catálogo de experiencias y alojamientos, solicitud/confirmación de reservas, panel administrativo, persistencia local de solicitudes y API REST.
- Tecnologías: TypeScript/Vite (frontend), Rust/Axum (backend exclusivo) y CouchDB documental.
- FUERA del MVP: cobros reales, cuentas de turistas, geolocalización verificada y contratos con operadores.

## Fase 2. Fundamentación científica
- Documentar fuentes en IEEE, ACM, Scopus y ScienceDirect para offline-first, replicación CouchDB y rendimiento Rust.
- Elaborar matriz de antecedentes con autor/año, método, tecnología, métricas, resultados y brecha. **No se inventan referencias**.
- Brecha a investigar: impacto conjunto de Rust + CouchDB sobre transacciones de micronegocios con redes intermitentes.

## Fase 3. Diseño experimental
- H0: la solución propuesta no mejora significativamente throughput ni tasa de error frente a una implementación monolítica comparable.
- H1: la mejora significativamente.
- Contenedores Docker para web, API, CouchDB y k6. `/tests/carga.js` mide solicitudes de lectura; `/tests/reservas.js` estresa concurrencia y comprueba que no haya reservas más allá de capacidad.
- Se requiere incorporar una arquitectura monolítica de referencia bajo condiciones equivalentes, repetir ensayos y degradar la red con `tc` en entorno de laboratorio controlado. **No está implementada la referencia ni la simulación de red**.

## Fase 4. Desarrollo e instrumentación
- `GET /api/experiences`: catálogo.
- `POST /api/experiences`: alta con clave administrativa.
- `GET /api/availability/:id/:date`: cupos por fecha.
- `POST /api/reservations`: registro idempotente, actualización optimista del documento de cupo con `_rev`.
- `GET /api/reservations`: listado administrativo.
- `GET /api/metrics`: solicitudes, errores 5xx y latencia promedio del proceso Rust.
- `GET /api/health`: disponibilidad de CouchDB.
- IndexedDB preserva solicitudes ante interrupciones; el navegador reintenta al reconectar o abrir la app.
- El prototipo no implementa replicación CouchDB-CouchDB entre instancias, telemetría por endpoint ni resolución distribuida de conflictos; son pasos siguientes.

## Fase 5. Análisis estadístico y éxito
- Throughput = transacciones exitosas / segundos.
- Tasa de errores = operaciones fallidas / operaciones evaluadas × 100.
- Latencia de sincronización = tiempo de última confirmación - tiempo de reconexión.
- Indicadores propuestos del documento del proyecto: 10 documentos/s, p95 < 500 ms con red estable, sincronización ≥95 %, recuperación ≤10 s en lote definido, RAM del backend <512 MB y errores de sincronización <5 %. **Son metas, no resultados**.
- Recoger lotes experimentales y analizar distribución; seleccionar ANOVA o prueba no paramétrica cuando sea adecuado.

## Fase 6. Memoria final
- Preparar memoria académica APA 7 con 15 apartados establecidos por la asignatura, decisiones de arquitectura, evidencias de pruebas, limitaciones, tablas/gráficos y conclusiones. Esta carpeta contiene notas técnicas, **no la memoria final**.

## Reglas de consistencia importantes
1. Cada experiencia posee capacidad máxima por fecha. Se usa un documento por experiencia-fecha; CouchDB detecta escrituras concurrentes por revisión (`_rev`) y se reintenta.
2. El campo de reserva `idempotency_key` evita duplicados cuando la confirmación HTTP se pierde y el mismo cliente reintenta.
3. Solicitud guardada en IndexedDB ≠ reserva confirmada; el estado de pago es `confirmada-sin-pago`.
4. La replicación entre servidores no debe considerarse activa solo por utilizar CouchDB. Los conflictos de reserva exigen una autoridad y reconciliación específica antes de replicación multi-maestro.
5. Para producción hacen falta autenticación por usuario/roles, TLS, cifrado de datos locales sensibles, pagos mediante proveedor externo, límites de solicitudes y protección de datos.
