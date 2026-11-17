import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { scenarios: { lecturas: { executor: 'constant-vus', vus: 10, duration: '30s' } }, thresholds: { http_req_failed: ['rate<0.05'], http_req_duration: ['p(95)<500'] } };
const base = __ENV.API_URL || 'http://localhost:8080';
export default function () { const r = http.get(`${base}/api/experiences`); check(r, { 'HTTP 200': x => x.status === 200 }); sleep(0.2) }
