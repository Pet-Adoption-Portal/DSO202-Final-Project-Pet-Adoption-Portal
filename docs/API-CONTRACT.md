# API contract (frontend ↔ api-gateway ↔ services)

This is the agreement between the website and the 13 backend services. The mock in
`frontend/js/mock/server.js` already follows it, so when you build a real service, copy
the routes below exactly and the website keeps working with no page changes.

**Rules for every service**

- Base path through the gateway: `/api`. Example: the browser calls `/api/pets/pet-tashi`,
  the gateway forwards `GET /pets/pet-tashi` to `pet` service.
- JSON in, JSON out. Errors are always `{ "error": "Message a user can read" }` with the right HTTP status.
- Auth: `Authorization: Bearer <JWT>`. The **gateway** verifies it once and forwards
  `X-User-Id`, `X-User-Role`, `X-Shelter-Id` headers. Services trust those headers (design decision D5),
  so NetworkPolicy must stop anything except the gateway from calling them.
- Optional: return `X-Served-By: <service-name>` so the website's request log shows which pod answered.
- Every service also exposes `GET /health` and `GET /metrics` (not routed through the gateway).

JWT claims: `{ sub: userId, role: "adopter" | "staff" | "admin", shelter_id: string | null, exp }`.

Status codes used: 200 OK, 201 Created, 204 No Content, 400 bad input, 401 not logged in,
403 wrong role, 404 not found, 409 conflict.

---

## Gateway routing table

| Path prefix | Service | # |
|---|---|---|
| `/signup` | signup | 3 |
| `/login` | login | 4 |
| `/profile` | profile | 5 |
| `/pets` | pet | 6 |
| `/search` | search | 7 |
| `/shelters` | shelter | 8 |
| `/favorites` | favorites | 9 |
| `/adoptions` | adoption | 10 |
| `/reviews` | review | 11 |
| `/history` | history | 12 |
| `/notifications` | notification | 13 |
| (none, consumes `email.queue`) | email-worker | 14 |
| `/reports` | reporting | 15 |

frontend (1) and api-gateway (2) complete the 15.

---

## 3. signup

### `POST /signup` (public)
```json
{ "name": "Karma Wangmo", "email": "k@x.bt", "password": "min 8 chars",
  "role": "adopter" | "staff", "district": "Thimphu", "shelterName": "only when role=staff" }
```
201 → `{ "user": { "id", "email", "role", "shelterId", "name" } }`
409 if email exists. A staff signup also creates a shelter with `status: "pending"`
(signup calls shelter service, or publishes an event; your choice, document it).

## 4. login

### `POST /login` (public)
`{ "email", "password" }` → 200 `{ "token": "<JWT>", "user": { "id", "email", "role", "shelterId", "name" } }`
401 `That email and password do not match.`

## 5. profile

### `GET /profile` (logged in)
→ `{ "userId", "name", "phone", "district", "homeType", "hasYard", "otherPets", "about", "email", "role" }`

### `PUT /profile` (logged in)
Body: any of `name, phone, district, homeType, hasYard, otherPets, about` → the updated profile.

## 6. pet

Pet object:
```json
{ "id", "name", "species": "dog|cat|rabbit|bird", "breed", "sex": "male|female",
  "ageMonths": 26, "size": "small|medium|large", "coat": "#b07a45", "description",
  "vaccinated": true, "neutered": true, "goodWith": ["adults","children","dogs","cats"],
  "imageUrl": "", "shelterId", "createdAt",
  "status": "available|pending|adopted", "shelterName": "joined for display" }
```
`status` and `shelterName` are not stored by pet service. In the live system the gateway or
search service adds them; until then the frontend can call adoption and shelter itself.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/pets?shelterId=` | public | list |
| GET | `/pets/:id` | public | 404 if missing |
| POST | `/pets` | staff of an approved shelter | 201, publishes **`pet.created`** `{petId, shelterId}` |
| PUT | `/pets/:id` | staff, own shelter | |
| DELETE | `/pets/:id` | staff, own shelter | 409 if an application is pending, 204 on success |

## 7. search

### `GET /search` (public)
Query: `q, species, sex, size, age (young|adult|senior), shelterId, goodWith, status (default available, or all), sort (newest|youngest|oldest|name), limit`
→ `{ "total": 12, "items": [Pet, ...] }`
Consumes `pet.created` (index the pet) and should also consume `application.decided` to keep `status` fresh.

## 8. shelter

Shelter: `{ "id", "name", "district", "address", "phone", "email", "about", "status": "pending|approved|rejected", "createdAt" }`

| Method | Path | Who |
|---|---|---|
| GET | `/shelters` | public, approved only |
| GET | `/shelters?status=pending` or `?status=all` | admin |
| GET | `/shelters/:id` | public |
| PUT | `/shelters/:id` | staff of that shelter |
| PATCH | `/shelters/:id/approval` `{status: "approved"|"rejected"}` | admin |

## 9. favorites

| Method | Path | Body / result |
|---|---|---|
| GET | `/favorites` | `["pet-tashi", ...]` |
| POST | `/favorites` | `{ "petId" }` → updated list |
| DELETE | `/favorites/:petId` | updated list |

## 10. adoption (hot path, the one-winner rule)

Application: `{ "id", "petId", "shelterId", "userId", "status": "submitted|approved|rejected", "message", "homeType", "hasYard", "otherPets", "experience", "createdAt", "decidedAt", "decisionNote" }`

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/adoptions/availability/:petId` | public | `{ petId, status, applicationId }` |
| POST | `/adoptions` | adopter | body `{ petId, message (≥20 chars), homeType, hasYard, otherPets, experience }` |
| GET | `/adoptions/mine` | adopter | applications, each with a joined `pet` |
| GET | `/adoptions/shelter` | staff | applications for own shelter, with `pet` and `applicant {name,email,phone}` |
| POST | `/adoptions/:id/decision` | staff | `{ decision: "approved"|"rejected", note }`, publishes **`application.decided`** |

`POST /adoptions` must run in ONE transaction:
```sql
UPDATE availability SET status = 'pending', application_id = $2
WHERE pet_id = $1 AND status = 'available';
-- 1 row  -> INSERT the application, return 201
-- 0 rows -> return 409 { "error": "...", "code": "PET_TAKEN" }
```
The website shows the "already has an application" screen on any 409. This is what experiment E2 tests.

Decision: approved → availability `adopted`; rejected → back to `available`.

`application.decided` payload:
`{ applicationId, petId, petName, shelterId, userId, userEmail, decision, note }`

## 11. review

| Method | Path | Who | Result |
|---|---|---|---|
| GET | `/reviews?shelterId=` | public | `{ average: 4.5, count: 2, items: [{id, shelterId, userId, authorName, rating, comment, createdAt}] }` |
| POST | `/reviews` | adopter | `{ shelterId, rating 1-5, comment }` → 201 review |

## 12. history

### `GET /history` (logged in)
→ `[{ id, userId, applicationId, petId, petName, shelterId, shelterName, outcome, at }]`
Built only from `application.decided` events.

## 13. notification

| Method | Path | Result |
|---|---|---|
| GET | `/notifications` | `{ unread: 1, items: [{ id, userId, title, body, link, read, createdAt }] }` |
| POST | `/notifications/:id/read` | the notification |
| POST | `/notifications/read-all` | `{ unread: 0 }` |

Consumes `application.decided`, writes an in-app message and adds `{to, subject, body}` to **`email.queue`**.

## 14. email-worker

No HTTP API (only `/health` and `/metrics`). Reads `email.queue`, sends to Mailpit over SMTP, retries on failure.
KEDA scales it on the stream's pending count. The mock-only route `GET /_mock/outbox` stands in for Mailpit's inbox
and disappears in live mode.

## 15. reporting

### `GET /reports/summary` (staff: own shelter, admin: everything)
```json
{ "scope": "Thimphu Animal Rescue",
  "pets": { "total": 6, "byStatus": { "available": 5, "pending": 1 }, "bySpecies": { "dog": 4, "cat": 2 } },
  "applications": { "total": 2, "byStatus": { "submitted": 1, "approved": 1 }, "averageDecisionDays": 2.5 },
  "shelters": { "approved": 3, "pending": 1 },
  "emailsSent": 3 }
```
`shelters` only for admin. Consumes `application.decided` for counters.

---

## Event streams (Redis Streams)

| Stream | Producer | Consumers (one consumer group each) |
|---|---|---|
| `pet.created` | pet | search, adoption |
| `application.decided` | adoption | notification, history, reporting (and search) |
| `email.queue` | notification | email-worker |

Every event has a unique `id`. Delivery is at least once, so each consumer stores the ids it processed
and skips repeats (the mock does this in `processed`).
