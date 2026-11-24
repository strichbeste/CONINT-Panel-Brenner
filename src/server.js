const { build } = require('./app');
const { init } = require('./db');

(async () => {
  await init();
  const app = build();
  await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
