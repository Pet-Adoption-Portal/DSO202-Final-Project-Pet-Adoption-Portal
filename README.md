# Pet Adoption Portal: website guide

DSO202 final project, College of Science and Technology.
Team: Dechen Wangdra Sherpa, Tandin Zangmo, Pema Dolker.

This folder holds **step 1** of the project: the complete website (the `frontend` service, #1 of 15).
It runs on its own today because a built-in **mock API** answers every request inside the browser.
Later, we replace the mock one service at a time with real containers, and the pages do not change.

---

## 1. Run it (pick one)

You only need a browser. Choose whichever tool you already have.

### Option A: Python (quickest)
```bash
cd pet-adoption-portal/frontend
python3 -m http.server 8080        # Windows: py -m http.server 8080
```
Open **http://localhost:8080**

### Option B: Node
```bash
cd pet-adoption-portal/frontend
npx serve -l 8080 .
```

### Option C: Docker (this is how it runs in Kubernetes)
```bash
cd pet-adoption-portal/frontend
docker build -t pet-portal/frontend:0.1.0 .
docker run --rm -p 8080:8080 pet-portal/frontend:0.1.0
```
Open **http://localhost:8080**, and check the probe: `curl localhost:8080/health`.

> Do not open `index.html` by double-clicking. Browsers block ES modules from `file://`, so you will see a blank page. Always use a server.

### Demo accounts (password `password123`)

| Role | Email | What to try |
|---|---|---|
| Adopter | `adopter@demo.bt` | Save pets, apply, see notifications, review a shelter |
| Shelter staff | `staff@thimphurescue.bt` | List a pet, approve or reject applications |
| Staff (2nd shelter) | `staff@parohaven.bt` | Shows staff only see their own shelter |
| Admin | `admin@demo.bt` | Approve "Bumthang Friends of Animals", see the email outbox |

The login page has one-click buttons for these. Data lives in your browser's localStorage;
**Admin → Reset demo data** brings everything back to the start.

---

## 2. A 5-minute demo script

1. **Home**: the five newest pets hang on a prayer-flag line. Search or use the quick chips.
2. **Find a pet**: filter by animal, age, sex, size, "good with", shelter. Filters stay in the URL.
3. Log in as **Adopter**, open **Tashi**, press the heart, then **Apply to adopt Tashi**.
4. Open Tashi's apply page again: you get *"Tashi already has an application"*. That is the
   **one-winner rule** (objective O3, experiment E2) working.
5. Log out, log in as **Shelter staff**. The dashboard lists Tashi's application. Approve it with a note.
6. Log in as **Adopter** again: a notification is waiting, Tashi is "Adopted", History shows the outcome,
   and you can review the shelter.
7. Log in as **Admin**: the email-worker outbox has the email; approve the pending Bumthang shelter.
8. Click **Request log** in the footer at any time: every call shows the path, **which microservice
   answered**, the status and the time, plus each event and the services that consumed it.
   This is a good slide for the presentation because it shows the architecture live.

---

## 3. Folder structure

```
pet-adoption-portal/
├── README.md                 this guide
├── docs/
│   └── API-CONTRACT.md       every endpoint each service must implement (the spec for step 2)
└── frontend/                 service #1: static site served by nginx
    ├── index.html            app shell: top bar, <main>, footer, request-log drawer
    ├── config.js             runtime config: apiMode 'mock' or 'live' (a ConfigMap in K8s)
    ├── css/styles.css        all styling (prayer-flag palette, responsive)
    ├── assets/favicon.svg
    ├── js/
    │   ├── app.js            hash router, role guards, nav bar, request log
    │   ├── api.js            the ONLY file that talks to the backend (mock or fetch)
    │   ├── auth.js           JWT session in sessionStorage
    │   ├── favorites.js      saved-pets cache + heart buttons
    │   ├── ui.js             escaping, formatting, toasts, pet drawings, pet card
    │   ├── mock/
    │   │   ├── db.js         seed data, split per owning service
    │   │   └── server.js     fake gateway + 13 services + event streams
    │   └── pages/            one file per screen (below)
    ├── nginx.conf            port 8080, /health, caching, security headers
    ├── Dockerfile            nginx-unprivileged image (non-root)
    └── .dockerignore
```

No build step, no npm packages, no framework. The whole image is about 50 MB and idles under 10 MiB,
which matters for our memory budget (proposal section 11).

---

## 4. Pages and the services behind them

| Route | Page file | Who | Services it calls |
|---|---|---|---|
| `#/` | home.js | everyone | search, shelter |
| `#/pets` | browse.js | everyone | search, shelter |
| `#/pets/:id` | pet.js | everyone | pet, adoption, shelter, review, search, favorites |
| `#/apply/:id` | apply.js | adopter | pet, profile, **adoption** (one-winner rule) |
| `#/login` | login.js | everyone | login |
| `#/signup` | signup.js | everyone | signup, login |
| `#/profile` | profile.js | logged in | profile (+ shelter for staff) |
| `#/favorites` | favorites.js | adopter | favorites, pet |
| `#/applications` | applications.js | adopter | adoption, history |
| `#/notifications` | notifications.js | logged in | notification |
| `#/shelters`, `#/shelters/:id` | shelters.js, shelter.js | everyone | shelter, review, search |
| `#/staff` | staff.js | staff | shelter, adoption, pet |
| `#/staff/pets/new`, `#/staff/pets/:id/edit` | pet-form.js | staff | pet |
| `#/reports` | reports.js | staff, admin | reporting |
| `#/admin` | admin.js | admin | shelter, email-worker outbox |

Every one of the 15 services is used by at least one screen, and api-gateway sits in front of all of them.

---

## 5. How the code works

**Request flow.** A page calls `api.get('/pets/123')`. `api.js` adds the JWT and either:
- **mock mode**: hands the call to `mock/server.js`, which acts like the gateway (checks the token once,
  finds the owning service by path, runs it, returns `{status, data, service}`), or
- **live mode**: `fetch('/api/pets/123')`, which the Ingress sends to the real api-gateway.

**Events.** Side effects are not done inside the request. Approving an application publishes
`application.decided`; notification, history and reporting each consume it, and notification puts a
message on `email.queue` for email-worker. Each consumer remembers event ids so a duplicate delivery
does nothing (Redis Streams is at-least-once).

**The one-winner rule.** In `mock/server.js` look for `THE ONE-WINNER RULE`. It checks
`availability.status === 'available'` and flips it to `pending` in one step, exactly like the single SQL
`UPDATE ... WHERE status = 'available'` adoption service will run in PostgreSQL.

**Roles.** `app.js` has a route table with allowed roles. Logged-out users are sent to login with a
`next` link back; wrong roles get a clear message. The mock enforces the same rules server-side,
because in the real system the UI check is only a convenience.

**Security habits already in place.** All user text goes through `esc()` before HTML; the token is in
sessionStorage (gone when the tab closes); nginx sends `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`; the container runs as non-root on port 8080.

---

## 6. Switching to the real backend (later steps)

`config.js`:
```js
window.__PORTAL_CONFIG__ = { apiMode: 'live', apiBase: '/api', environment: 'dev' };
```
In Kubernetes we don't edit the file inside the image. A ConfigMap is mounted over it:
```yaml
volumeMounts:
  - name: portal-config
    mountPath: /usr/share/nginx/html/config.js
    subPath: config.js
```
so the same image tag runs in `pet-portal-dev` and `pet-portal-prod`. The footer badge shows
"Mock API" or "Live API (dev)" so you always know which one you're looking at.

Live mode is all or nothing: every service in the contract must answer. While we build services one
by one, keep using mock mode in the browser and test each new service on its own with `curl` against
the contract in `docs/API-CONTRACT.md`.

---

## 7. Changing things

- **Add a pet field**: add it to the seed in `mock/db.js`, `pickPet()` in `mock/server.js`, the form in
  `pages/pet-form.js`, and the table in `pages/pet.js`. Then update `docs/API-CONTRACT.md`.
- **Add a page**: create `js/pages/x.js` exporting `async function ({ main, params, query, rerender })`,
  import it in `app.js`, add a row to `routes`.
- **Colours and fonts**: CSS variables at the top of `css/styles.css`.
- **Data looks wrong after editing seed data**: Admin → Reset demo data (or clear site data in the browser).

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Blank page | You opened the file directly. Run a server (section 1). Check the browser console. |
| Fonts look plain | Google Fonts could not load (offline). The site falls back to system fonts; nothing breaks. |
| Port 8080 in use | Use another port: `python3 -m http.server 5500`. |
| "Cannot reach the server" | `config.js` is in live mode but no gateway is running. Set `apiMode: 'mock'`. |
| Old data after code changes | Reset demo data from the admin page. |
