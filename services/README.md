# Backend services (Step 2: the service template)

This folder will hold the 13 backend microservices. Right now it has the two things every one of them
is built from:

- **`common/`**, a shared library: the HTTP server, health checks, metrics, JSON logs, error format,
  login headers, PostgreSQL, Redis Streams events and the etcd registry. Written and tested once.
- **`template/`**, a small working service built on `common/`. Every real service starts as a copy of it.

Think of `common/` as the standard kitchen every shop in the complex gets (gas, water, fire alarm, till),
and `template/` as a sample shop already fitted with it. To open the pet shop, you copy the sample shop
and change only the menu (the routes).

---

## 1. Folder layout

```
pet-adoption-portal/
├── frontend/                 (from step 1, unchanged)
├── docs/API-CONTRACT.md      (from step 1; the spec each service implements)
├── docker-compose.yml        NEW: Postgres, Redis, etcd, Mailpit for local work
├── scripts/new-service.sh    NEW: creates a service from the template
└── services/                 NEW
    ├── package.json          npm workspaces: lists every service folder
    ├── package-lock.json     exact dependency versions for the whole team
    ├── Dockerfile            ONE Dockerfile for all services (--build-arg SERVICE=pet)
    ├── eslint.config.js
    ├── common/src/
    │   ├── server.js         createService(): wires everything below together
    │   ├── config.js         settings from environment variables
    │   ├── db.js             Postgres pool (own schema), transactions, migrations
    │   ├── events.js         Redis Streams publish/consume, exactly-once handling
    │   ├── registry.js       etcd registration with a lease, lookup, live config
    │   ├── metrics.js        Prometheus RED metrics
    │   ├── auth.js           who is calling (headers from the gateway)
    │   ├── errors.js         HttpError, notFound(), conflict(), need()
    │   └── migrate.js        migrations-only runner (for the Kubernetes PreSync Job)
    └── template/
        ├── src/index.js      entry point: node src/index.js
        ├── src/app.js        SERVICE_NAME + buildService()
        ├── src/routes.js     the endpoints  ← each service replaces this
        ├── src/consumers.js  stream handlers ← and this
        ├── src/migrate.js
        ├── migrations/001_create_examples.sql ← and this
        ├── test/service.test.js
        └── .env.example
```

**Why npm workspaces?** All services live in one repo but install from one lockfile, so they share
`common/` without publishing it anywhere, and every teammate gets identical versions.

---

## 2. What every service gets for free

| Feature | Where | Why it matters for the project |
|---|---|---|
| `GET /health` | server.js | Liveness probe. Never checks the database, so a DB blip doesn't restart every pod. |
| `GET /ready` | server.js | Readiness probe. Checks Postgres and Redis; 503 removes the pod from the Service. |
| `GET /metrics` | metrics.js | `http_requests_total`, `http_request_duration_seconds`, memory, event loop. Same names in all 15, so one dashboard fits all. KEDA scales `adoption` on this. |
| JSON logs with `trace_id` | server.js | Loki can search them; the trace id comes from the `traceparent` header, so one request has one id across all services. |
| Error shape `{ "error": "..." }` | server.js, errors.js | Exactly what the website expects (API contract). |
| `X-Served-By` header | server.js | The website's Request log shows which service answered. |
| Login info from the gateway | auth.js | `requireRole(req, 'staff')` → 401 or 403 automatically. |
| Postgres in its own schema | db.js | Each service sees only its tables (proposal D2). `db.transaction()` for multi-step writes. |
| Migrations | db.js | `migrations/NNN_name.sql` run once each, in order, with a lock so two replicas never clash. |
| Events | events.js | `events.publish('pet.created', {...})` and `events.consume(...)`. Retried on failure; duplicates ignored. |
| etcd registry | registry.js | Registers `/services/<name>/<pod>` with a 10 s lease; key vanishes if the pod dies. Live config via `/config/<name>/...`. |
| Graceful shutdown | server.js | On SIGTERM: `/ready` → 503, short drain delay, finish requests, leave the registry, stop consumers, close connections. |

### The two guarantees worth explaining in the presentation

**Exactly-once event handling.** Redis Streams may deliver an event twice. The consumer records the
event id in `processed_events` **in the same database transaction** as its work. A repeat finds the id
already there and does nothing. An event is acknowledged only after that transaction commits, so a
crash means the event is retried, not lost.

**Self-healing registry.** The registry entry is tied to a lease that the service renews every few
seconds. A crashed pod stops renewing, and etcd deletes the entry by itself after 10 seconds.

---

## 3. Run it on your laptop

You need **Node.js 22** and **Docker Desktop**.

```bash
# 1. start the dependencies (from the repo root)
docker compose up -d postgres redis etcd

# 2. install all services' packages once
cd services
npm ci

# 3. run the template with auto-restart on save
cd template
cp .env.example .env
npm run dev
```

Try it in another terminal:

```bash
curl localhost:8090/health
curl localhost:8090/ready          # {"status":"ready","checks":{"postgres":"ok","redis":"ok"}}
curl localhost:8090/metrics | head

# Create an item as "staff". These headers are what the api-gateway will add after checking the JWT.
curl -X POST localhost:8090/examples -H 'content-type: application/json' \
     -H 'x-user-id: u-staff' -H 'x-user-role: staff' -d '{"name":"Tashi"}'
curl localhost:8090/examples

# See it in the registry
docker compose exec etcd etcdctl get --prefix /services/
```

Or run everything in containers: `docker compose up -d --build`, then use port 8090 the same way.

### Tests

```bash
cd services
npm test                                    # quick tests, no database needed
docker compose up -d postgres redis         # then the full set:
cd template && DATABASE_URL=postgres://portal:portal@localhost:5432/petportal REDIS_URL=redis://localhost:6379 npm test
npm run lint                                # from services/
```

### Build the image

```bash
docker build -t pet-portal/template:dev --build-arg SERVICE=template services
```

The image runs as the non-root `node` user on port 8080, contains only production packages for that one
service, and caps the JS heap so memory stays predictable.

---

## 4. Create a real service (what we do in Steps 3 and 4)

```bash
./scripts/new-service.sh pet
```

This copies `template/` to `services/pet/`, renames it everywhere, and adds it to the workspaces.
Then for that service:

1. **`migrations/`**: delete the example file, write `001_create_pets.sql` with the real tables.
2. **`src/routes.js`**: replace the example routes with the ones listed for this service in
   `docs/API-CONTRACT.md` (same paths, same JSON, same status codes).
3. **`src/consumers.js`**: subscribe to the streams the contract lists for this service, or leave it empty.
4. **`test/`**: keep the built-in tests, add tests for the new routes.
5. `npm run dev`, check with curl, then point the website at it.

Nothing about health, metrics, logs, shutdown or the registry needs to be written again.

---

## 5. Language decision (Section 10 of the proposal): measured

The proposal says: build the template, measure it, keep the language if it fits within 128 MiB.
Measured on Node.js 22 with Postgres, Redis and etcd all connected:

| Measurement | Result |
|---|---|
| Memory at idle | 94 to 98 MB |
| Memory under load (50 connections, 20 s) | peak 109 MB |
| Throughput, each request a Postgres query | ~5,000 requests/s on one process |
| Latency at that load | p50 8 ms, p99 33 ms |
| JS heap actually in use | 18 MB (the rest is the Node runtime itself) |
| Production `node_modules` per image | 22 MB |

Change made while measuring: the usual `etcd3` library added ~35 MB per pod (it bundles gRPC), so
`registry.js` uses etcd's built-in HTTP API with Node's own `fetch` instead. Same features, no library.

**Verdict:** Node.js passes the 128 MiB rule, but with little headroom. That has two consequences:

1. **Container memory settings** should be `requests: 96Mi`, `limits: 160Mi`, not the 64Mi/128Mi in the
   proposal's example values file. A 128Mi limit risks the pod being OOM-killed at peak.
2. **The memory budget (proposal Section 11) grows.** At ~100 MB per pod, prod (21 to 38 pods) is
   about 2.1 to 3.8 GB and dev (15 pods) about 1.5 GB, instead of 1.3 to 2.4 GB and 1 GB. The total
   moves from about 9 to 11 GB to about **10.5 to 13 GB**. The proposal's first lever still applies:
   scale dev to zero during load tests.

The alternative is **Go**, which typically uses 15 to 25 MB per service and would save about 2.5 GB in total,
at the cost of a language some of the team doesn't know yet. With a 16 GB host, Node is fine. With a
12 GB host, Go is safer. This is a team decision; record it in the final report either way.

---

## 6. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | HTTP port |
| `SERVICE_NAME` | folder name | used in logs, metrics, registry, consumer group |
| `SERVICE_VERSION` | 0.0.0-dev | set by the image build (`--build-arg VERSION=<git sha>`) |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, `error`, `silent` |
| `DATABASE_URL` | (none) | `postgres://user:pass@host:5432/db`; empty = no database |
| `DB_SCHEMA` | service name | Postgres schema this service owns |
| `DB_POOL_MAX` | 5 | connections per pod (replicas × this must stay under Postgres `max_connections`) |
| `RUN_MIGRATIONS` | true | `false` in the cluster, where the PreSync Job migrates |
| `REDIS_URL` | (none) | `redis://host:6379`; empty = no events |
| `ETCD_ENDPOINTS` | (none) | comma-separated, e.g. `http://etcd-0:2379,http://etcd-1:2379,http://etcd-2:2379` |
| `REGISTRY_TTL_SECONDS` | 10 | lease length |
| `POD_IP` | (none) | from the Kubernetes downward API; the address stored in the registry |
| `SHUTDOWN_DELAY_MS` | 0 | keep serving this long after SIGTERM (use ~5000 in the cluster) |
| `SHUTDOWN_TIMEOUT_MS` | 20000 | force exit if shutdown takes longer |

---

## 7. What's deliberately not here yet

- **Tracing (OpenTelemetry → Tempo).** Logs already carry the trace id; the OTel SDK is added in the
  observability step, so we can measure its memory cost separately.
- **Kubernetes files** (Helm chart, probes, ConfigMaps). They come in Step 3 with the first real services,
  and go in the `pet-portal-config` repo as the proposal describes.
- **The api-gateway.** It's built in Step 3 from this same template, plus JWT checking and routing.
