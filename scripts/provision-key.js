const { pool, init } = require('../src/db');
const { hash, newKey } = require('../src/app');

(async () => {
  await init();
  const k = newKey();
  await pool.query('INSERT INTO api_keys(key_hash) VALUES($1)', [hash(k)]);
  console.log('API key (save it now, shown once):', k);
  await pool.end();
})();
