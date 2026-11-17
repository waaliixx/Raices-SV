import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 10, iterations: 40 };
const base = __ENV.API_URL || 'http://localhost:8080';
export default function () { const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10); const key = `k6-${__VU}-${__ITER}-${Date.now()}`; const data = { experience_id: 'ruta-flores', date, people: 1, name: 'Turista Prueba', email: 'demo@example.org', idempotency_key: key }; const res = http.post(`${base}/api/reservations`, JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }); check(res, { 'éxito o cupos agotados': r => r.status === 200 || r.status === 409 }) }
