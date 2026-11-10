import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 2, duration: '10s', thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] } };
export default function () {
  const response = http.post(`${__ENV.API_URL || 'http://localhost:4000'}/graphql`, JSON.stringify({query:'{ purchases { id merchant } }'}), {headers:{'Content-Type':'application/json',Authorization:`Bearer ${__ENV.ACCESS_TOKEN}`}});
  check(response, {'GraphQL succeeds':r=>r.status===200&&!r.json().errors});
}
