# Campus Events Board API

REST API (Node.js 22, Fastify, PostgreSQL) for campus events with API-key protected write endpoints, PostHog feature flags and a full CI/CD pipeline (GitHub Actions, Docker Hub, AWS EC2 + RDS, blue/green).

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /health | no | `{"status":"ok"}` |
| GET | /events | no | `page`, `limit` (1-100), `query` (flag `ff_search_enabled`), `sort=newest\|oldest` (flag `ff_sort_enabled`) |
| GET | /events/:id | no | 404 if unknown, 400 if not a UUID |
| POST | /events | `x-api-key` | 201 |
| PUT | /events/:id | `x-api-key` | 200 / 404 |
| DELETE | /events/:id | `x-api-key` | 204 / 404 |
| POST | /keys/rotate | `x-api-key` | returns a new key, the old one becomes invalid |

Missing key: 401. Invalid key: 403. Keys are stored as SHA-256 hashes only.

When a flag is off, the parameter is ignored (no error): search returns the unfiltered list, sorting falls back to newest first. `features` in the list response shows the current flag values.

## Local setup

```bash
cp .env.example .env   # fill in values, never commit
npm ci
npm test
node scripts/provision-key.js   # prints a new API key once
docker compose up --build
```

## Docker

```bash
docker build -t campus-events-api .
docker run --env-file .env -p 3000:3000 campus-events-api
docker tag campus-events-api <user>/campus-events-api:<tag>
docker push <user>/campus-events-api:<tag>
```

Configuration is passed via environment variables only: `DATABASE_URL`, `DB_SSL`, `POSTHOG_KEY`, `POSTHOG_HOST`, `POSTHOG_PERSONAL_KEY`.

## Branches and pipeline

- `main`: lint, tests, SonarQube Cloud, Snyk, Docker build.
- `deploy/production`: all of the above plus Docker Hub push (SHA + latest tags), deploy to the inactive colour on EC2, k6 E2E/performance tests, and nginx switch.

See `.github/workflows/pipeline.yml` and `deploy/`.
