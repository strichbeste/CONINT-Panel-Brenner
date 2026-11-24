const crypto = require('crypto');
const Fastify = require('fastify');
const { pool } = require('./db');
const { isEnabled } = require('./flags');

const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');
const newKey = () => crypto.randomBytes(32).toString('hex');

const eventBody = {
  type: 'object',
  required: ['name', 'description', 'location', 'event_date'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 1 },
    location: { type: 'string', minLength: 1 },
    event_date: { type: 'string', format: 'date-time' },
  },
};
const idParams = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
};

function build() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  async function auth(req, reply) {
    const key = req.headers['x-api-key'];
    if (!key) return reply.code(401).send({ error: 'Missing API key' });
    const r = await pool.query('SELECT id FROM api_keys WHERE key_hash=$1', [hash(key)]);
    if (!r.rowCount) return reply.code(403).send({ error: 'Invalid API key' });
    req.keyId = r.rows[0].id;
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/keys/rotate', { onRequest: auth }, async (req) => {
    const key = newKey();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM api_keys WHERE id=$1', [req.keyId]);
      await c.query('INSERT INTO api_keys(key_hash) VALUES($1)', [hash(key)]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    return { api_key: key };
  });

  app.post('/events', { onRequest: auth, schema: { body: eventBody } }, async (req, reply) => {
    const { name, description, location, event_date } = req.body;
    const r = await pool.query(
      `INSERT INTO events(name,description,location,event_date)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [name, description, location, event_date]);
    return reply.code(201).send(r.rows[0]);
  });

  app.put('/events/:id', { onRequest: auth, schema: { body: eventBody, params: idParams } },
    async (req, reply) => {
      const { name, description, location, event_date } = req.body;
      const r = await pool.query(
        `UPDATE events SET name=$1,description=$2,location=$3,event_date=$4,updated_at=now()
         WHERE id=$5 RETURNING *`,
        [name, description, location, event_date, req.params.id]);
      return r.rowCount ? r.rows[0] : reply.code(404).send({ error: 'Event not found' });
    });

  app.delete('/events/:id', { onRequest: auth, schema: { params: idParams } },
    async (req, reply) => {
      const r = await pool.query('DELETE FROM events WHERE id=$1', [req.params.id]);
      return r.rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Event not found' });
    });

  app.get('/events/:id', { schema: { params: idParams } }, async (req, reply) => {
    const r = await pool.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    return r.rowCount ? r.rows[0] : reply.code(404).send({ error: 'Event not found' });
  });

  app.get('/events', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          query: { type: 'string', minLength: 1 },
          sort: { type: 'string', enum: ['newest', 'oldest'] },
        },
      },
    },
  }, async (req) => {
    const { page, limit, query, sort } = req.query;
    const searchOn = await isEnabled('ff_search_enabled', req.log);
    const sortOn = await isEnabled('ff_sort_enabled', req.log);
    const where = [];
    const params = [];
    if (query && searchOn) {
      params.push(query);
      where.push(`to_tsvector('english', name||' '||description) @@ plainto_tsquery('english', $${params.length})`);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const order = sortOn && sort === 'oldest' ? 'created_at ASC, id' : 'created_at DESC, id';
    const total = Number((await pool.query(`SELECT count(*) FROM events ${w}`, params)).rows[0].count);
    const rows = (await pool.query(
      `SELECT * FROM events ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params)).rows;
    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      features: { search: searchOn, sort: sortOn },
    };
  });

  return app;
}

module.exports = { build, hash, newKey };
