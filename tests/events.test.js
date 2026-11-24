jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() }, init: jest.fn() }));
jest.mock('../src/flags', () => ({ isEnabled: jest.fn() }));

const { pool } = require('../src/db');
const { isEnabled } = require('../src/flags');
const { build, hash } = require('../src/app');

const KEY = 'testkey';
const H = { 'x-api-key': KEY };
const ID = '11111111-1111-4111-8111-111111111111';
const body = { name: 'Hack', description: 'Night', location: 'FHTW', event_date: '2026-12-01T18:00:00Z' };
let app;

beforeEach(() => {
  app = build();
  pool.query.mockReset();
  isEnabled.mockReset().mockResolvedValue(true);
});

const validKey = () => pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });
const invalidKey = () => pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

test('POST /events without key -> 401', async () => {
  const r = await app.inject({ method: 'POST', url: '/events', payload: body });
  expect(r.statusCode).toBe(401);
});

test('POST /events with invalid key -> 403', async () => {
  invalidKey();
  const r = await app.inject({ method: 'POST', url: '/events', headers: H, payload: body });
  expect(r.statusCode).toBe(403);
});

test('API key is looked up as hash, not plaintext', async () => {
  invalidKey();
  await app.inject({ method: 'POST', url: '/events', headers: H, payload: body });
  expect(pool.query.mock.calls[0][1]).toEqual([hash(KEY)]);
  expect(pool.query.mock.calls[0][1]).not.toContain(KEY);
});

test('POST /events creates event -> 201', async () => {
  validKey();
  pool.query.mockResolvedValueOnce({ rows: [{ id: ID, ...body }] });
  const r = await app.inject({ method: 'POST', url: '/events', headers: H, payload: body });
  expect(r.statusCode).toBe(201);
  expect(r.json().id).toBe(ID);
});

test('POST /events missing field -> 400', async () => {
  validKey();
  const r = await app.inject({ method: 'POST', url: '/events', headers: H, payload: { name: 'x' } });
  expect(r.statusCode).toBe(400);
});

test('PUT /events/:id updates -> 200', async () => {
  validKey();
  pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: ID, ...body }] });
  const r = await app.inject({ method: 'PUT', url: `/events/${ID}`, headers: H, payload: body });
  expect(r.statusCode).toBe(200);
});

test('PUT /events/:id unknown -> 404', async () => {
  validKey();
  pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
  const r = await app.inject({ method: 'PUT', url: `/events/${ID}`, headers: H, payload: body });
  expect(r.statusCode).toBe(404);
});

test('DELETE /events/:id -> 204', async () => {
  validKey();
  pool.query.mockResolvedValueOnce({ rowCount: 1 });
  const r = await app.inject({ method: 'DELETE', url: `/events/${ID}`, headers: H });
  expect(r.statusCode).toBe(204);
});

test('GET /events/:id unknown -> 404, bad id -> 400', async () => {
  pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
  expect((await app.inject({ url: `/events/${ID}` })).statusCode).toBe(404);
  expect((await app.inject({ url: '/events/abc' })).statusCode).toBe(400);
});

test('GET /events returns pagination info', async () => {
  pool.query.mockResolvedValueOnce({ rows: [{ count: '25' }] }).mockResolvedValueOnce({ rows: [] });
  const r = await app.inject({ url: '/events?page=2&limit=10' });
  expect(r.json().pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
});

test('GET /events invalid limit -> 400', async () => {
  expect((await app.inject({ url: '/events?limit=0' })).statusCode).toBe(400);
});

test('search flag off ignores query, on uses full-text', async () => {
  isEnabled.mockResolvedValue(false);
  pool.query.mockResolvedValue({ rows: [{ count: '0' }] });
  await app.inject({ url: '/events?query=hack' });
  expect(pool.query.mock.calls[0][0]).not.toContain('tsvector');
  pool.query.mockClear();
  isEnabled.mockResolvedValue(true);
  await app.inject({ url: '/events?query=hack' });
  expect(pool.query.mock.calls[0][0]).toContain('tsvector');
});

test('sort flag on -> oldest ASC, flag off -> DESC', async () => {
  pool.query.mockResolvedValue({ rows: [{ count: '0' }] });
  await app.inject({ url: '/events?sort=oldest' });
  expect(pool.query.mock.calls[1][0]).toContain('created_at ASC');
  pool.query.mockClear();
  isEnabled.mockResolvedValue(false);
  await app.inject({ url: '/events?sort=oldest' });
  expect(pool.query.mock.calls[1][0]).toContain('created_at DESC');
});

test('key rotation returns new key and removes old one', async () => {
  validKey();
  const client = { query: jest.fn().mockResolvedValue({}), release: jest.fn() };
  pool.connect.mockResolvedValue(client);
  const r = await app.inject({ method: 'POST', url: '/keys/rotate', headers: H });
  expect(r.statusCode).toBe(200);
  expect(r.json().api_key).toHaveLength(64);
  expect(client.query.mock.calls.some((c) => String(c[0]).startsWith('DELETE'))).toBe(true);
});
