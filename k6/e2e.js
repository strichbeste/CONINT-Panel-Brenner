import http from 'k6/http';
import { check, group } from 'k6';

const BASE = __ENV.BASE_URL;
const KEY = __ENV.API_KEY;

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 401, 403, 404));

export const options = {
  vus: 5,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    checks: ['rate>0.99'],
  },
};

const json = { 'Content-Type': 'application/json' };
const auth = { 'Content-Type': 'application/json', 'x-api-key': KEY };
const body = JSON.stringify({
  name: 'k6 event',
  description: 'created by k6',
  location: 'FHTW',
  event_date: '2026-12-01T18:00:00Z',
});

export default function () {
  group('public flows', () => {
    const health = http.get(`${BASE}/health`);
    check(health, { 'health 200': (r) => r.status === 200 });

    const list = http.get(`${BASE}/events?page=1&limit=5`);
    check(list, {
      'list 200': (r) => r.status === 200,
      'list has pagination': (r) => r.json('pagination.page') === 1,
    });
  });

  group('auth rules', () => {
    check(http.post(`${BASE}/events`, body, { headers: json }), {
      'no key -> 401': (r) => r.status === 401,
    });
    check(http.post(`${BASE}/events`, body, { headers: { ...json, 'x-api-key': 'wrong' } }), {
      'wrong key -> 403': (r) => r.status === 403,
    });
  });

  group('authenticated event lifecycle', () => {
    const created = http.post(`${BASE}/events`, body, { headers: auth });
    check(created, { 'create 201': (r) => r.status === 201 });
    const id = created.json('id');

    check(http.get(`${BASE}/events/${id}`), { 'get 200': (r) => r.status === 200 });
    check(http.put(`${BASE}/events/${id}`, body, { headers: auth }), {
      'update 200': (r) => r.status === 200,
    });
    check(http.del(`${BASE}/events/${id}`, null, { headers: auth }), {
      'delete 204': (r) => r.status === 204,
    });
    check(http.get(`${BASE}/events/${id}`), { 'deleted -> 404': (r) => r.status === 404 });
  });
}
