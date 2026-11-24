# Campus Events Board API

REST API for campus events (Node.js 22, Fastify 5, PostgreSQL on Amazon RDS). Reading is public, writing requires an API key. Search and sorting are controlled at runtime by PostHog feature flags. The project includes a complete CI/CD pipeline (GitHub Actions, SonarQube Cloud, Snyk, Jest, k6, Docker Hub) and a blue/green deployment on AWS EC2.

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | no | Returns `{"status":"ok"}` |
| GET | `/events` | no | Paginated list. Parameters: `page` (default 1), `limit` (1-100, default 10), `query`, `sort` |
| GET | `/events/:id` | no | One event. 404 if unknown, 400 if the id is not a UUID |
| POST | `/events` | `x-api-key` | Create an event, 201 |
| PUT | `/events/:id` | `x-api-key` | Update an event, 200 or 404 |
| DELETE | `/events/:id` | `x-api-key` | Delete an event, 204 or 404 |
| POST | `/keys/rotate` | `x-api-key` | Returns a new key and invalidates the calling key |

Required body fields for POST and PUT: `name`, `description`, `location`, `event_date` (ISO 8601 date-time). Unknown fields are rejected with 400.

Authentication errors: missing `x-api-key` header returns 401, unknown key returns 403. Keys are stored as SHA-256 hashes only; the plain key is shown once when it is created.

Example list response:

```json
{"data":[],"pagination":{"page":1,"limit":10,"total":0,"totalPages":0},"features":{"search":false,"sort":false}}
```

## Feature flags (PostHog)

| Flag | When on | When off |
|---|---|---|
| `ff_search_enabled` | `query` filters by PostgreSQL full-text search over name and description | `query` is ignored, the unfiltered list is returned (no error) |
| `ff_sort_enabled` | `sort=newest` or `sort=oldest` orders by creation date | `sort` is ignored, default order is newest first (`created_at DESC, id`) |

The flags are independent and are evaluated on every `GET /events` request, so they can be toggled in the PostHog dashboard without a rebuild or deploy. The current values are returned in `features`. Every evaluation is logged (`feature flag evaluated`). Without `POSTHOG_KEY` both flags count as off.

Verify:

```bash
curl -s "http://<host>/events?limit=1"   # check "features"
docker logs campus-blue | grep "feature flag"
```

## Configuration

The same image runs everywhere; configuration is passed as environment variables and is never committed.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `DB_SSL` | `true` enables TLS to the database (used with RDS) |
| `POSTHOG_KEY` | PostHog project key |
| `POSTHOG_HOST` | PostHog host, default `https://eu.i.posthog.com` |
| `POSTHOG_PERSONAL_KEY` | Optional; enables local flag evaluation with polling every 30 s |
| `PORT` | Listen port, default 3000 |

The tables `events` and `api_keys` (with a GIN index for full-text search) are created at startup.

## Local setup

```bash
cp .env.example .env          # set POSTGRES_PASSWORD (optional: POSTHOG_KEY, POSTHOG_HOST)
npm ci
npm test                      # Jest with coverage
npm run lint
docker compose up --build     # API on :3000, PostgreSQL 16 on :5432
docker compose exec api node scripts/provision-key.js   # prints an API key once
```

## Docker

```bash
docker build -t campus-events-api .
docker run --rm -p 3000:3000 -e DATABASE_URL=<connection-string> campus-events-api
docker tag campus-events-api <dockerhub-user>/campus-events-api:<tag>
docker push <dockerhub-user>/campus-events-api:<tag>
```

The image is based on `node:22-alpine`, contains production dependencies, `src` and `scripts` only, runs as user `node` and has a health check on `/health`. `.dockerignore` excludes `node_modules`, tests, `.git`, `.github`, `.env` and markdown files.

## Branches and pipeline

Workflow: `.github/workflows/pipeline.yml`, triggered on push to `main` and `deploy/production`.

| Stage | Job | `main` | `deploy/production` |
|---|---|---|---|
| 1a | ESLint (JSON report as artifact) | yes | yes |
| 2 | Jest with coverage (artifact) | yes | yes |
| 1b | SonarQube Cloud, quality gate must pass | yes | yes |
| 1c | Snyk, fails on high or critical findings | yes | yes |
| 3 | Docker build | yes | yes |
| 4 | Push to Docker Hub (tags: commit SHA and `latest`) | no | yes |
| 5 | Deploy to the inactive colour on EC2 | no | yes |
| 6a | k6 E2E and performance tests against the inactive colour | no | yes |
| 6b | Switch nginx to the new colour | no | yes |

Each job depends on its predecessors, so a failed check stops all later stages and nothing is published or switched. A final job writes a failure summary to the GitHub step summary. Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `EC2_HOST`, `EC2_SSH_KEY`, `K6_API_KEY`, `SONAR_TOKEN`, `SNYK_TOKEN`; variables: `SONAR_ORG`, `SONAR_PROJECT`.

## Blue/green deployment

Two containers run on one EC2 instance: `campus-blue` (host port 3001) and `campus-green` (3002). nginx on port 80 forwards to the active colour, which is stored in `/opt/campus/active`.

1. `deploy/deploy.sh <image>` starts the image in the inactive colour and waits for `/health`.
2. k6 (`k6/e2e.js`) runs against the inactive colour. Thresholds: `http_req_failed < 1%`, `http_req_duration p(95) < 800 ms`, `checks > 99%`.
3. Only if k6 passes, `deploy/switch.sh <colour>` points nginx to the new colour, retries the health check and rolls back to the previous colour if it fails.
4. The previous colour keeps running for rollback:

```bash
ssh -i <key.pem> ec2-user@<host> 'bash -s -- <blue|green>' < deploy/switch.sh
```

One-time server preparation: `deploy/server-setup.sh` (nginx as switch). The database is a private Amazon RDS instance reached over TLS.

## Known limitations

- Plain HTTP only (no domain or certificate in the AWS Learner Lab).
- The security group allows SSH, HTTP and ports 3001-3002 from anywhere, because GitHub runners have changing IPs and k6 tests the inactive colour from outside.
- TLS to RDS is enabled without certificate verification (`rejectUnauthorized: false`).
- Coverage excludes `src/server.js` (Jest); Sonar additionally excludes `src/db.js`, `src/flags.js`, `scripts/` and `k6/` from coverage.
