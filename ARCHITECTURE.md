# Architecture

How TIMESTIN CRM is put together, for developers picking up the codebase. Business rules and formulas live in [CLAUDE.md](CLAUDE.md); the operator-facing manual is [CRM.md](CRM.md).

## Shape

Two independently deployed halves with no shared code, no proxy, and no BFF. The frontend is a static bundle that calls an absolute cross-origin API URL baked in at build time.

```
Browser ──▶ Netlify (static React bundle)
               │  HTTPS, REACT_APP_BACKEND_URL
               ▼
            Vercel serverless (Express)  ──▶  MongoDB Atlas
               /api/*                          db: timestin_crm
```

Because `REACT_APP_BACKEND_URL` is a CRA variable, it is **inlined at build time**. Repointing the frontend at a different backend requires a rebuild, not a config change.

## Backend

`backend/` — Express 4 + Mongoose 8. 63 endpoints across 14 routers (~2,100 lines). **There is no service or repository layer**; business logic lives directly in route handlers. Models are thin (15–31 lines) and carry almost no validation.

| Layer | File |
|---|---|
| Entry / CORS / route mounting | [server.js](backend/server.js) |
| Connection cache | [config/db.js](backend/config/db.js) |
| JWT + role gate | [middleware/auth.js](backend/middleware/auth.js) |
| Audit trail helper | [lib/activityLogger.js](backend/lib/activityLogger.js) |
| Routers | [routes/](backend/routes/) |
| Schemas | [models/](backend/models/) |

### Request lifecycle

Tracing `POST /api/production`:

1. **CORS** — `Origin` checked against the `CORS_ORIGINS` allowlist.
2. **DB gate** — a per-request middleware awaits `connectDB()`, skipping `OPTIONS` and `/api/health`. Serverless invocations may be cold.
3. **`authenticate`** — verifies the JWT, re-fetches the user from Mongo, rejects locked accounts, sets `req.user`. Admin routes then chain `adminRequired`.
4. **Handler** — generates a UUID, calls Mongoose directly, runs any cascade, fires `logActivity()`.
5. **Response** — bare JSON. Every handler is a `try/catch` returning `{ detail: "message" }` on error.

### Conventions

- **IDs are server-generated UUIDv4 in an `id` field.** Mongo's `_id` is projected out of every response. Never key off `_id`.
- **Dates are stored as ISO strings, not `Date`.** Indexes sort the strings. This is the source of the repeated timezone day-shift bugs in git history — see `parseImportDate` in [frontend/src/lib/utils.js](frontend/src/lib/utils.js) for the noon-UTC pinning pattern the project uses to avoid them.
- **Derived stock is computed at read time, never stored.** `available = produced − dispatched`, and so on.
- **Aggregation happens in Node, not Mongo.** Routes `.find({})` whole collections with projections and `.reduce()` in JS; there are no `$group` pipelines. Fine at current volume.
- **Access control:** config data (users, brands, sizes, customers, menu items, backups, admin) is `authenticate + adminRequired`. Operational CRUD (purchases, printing, production, dispatch, POs) requires only `authenticate` — any logged-in user can edit or delete any record.
- **Two models carry legacy dual shapes.** `Dispatch` has both top-level `brand_id/quantity/purchase_order_id` fields and the current `items[]` array; new code writes both, populating the legacy fields from `items[0]`. A query on only the top-level field will miss multi-item dispatches. `PrintingJob` similarly keeps a deprecated `status` field.

### Serverless constraints

`server.js` exports the Express app instead of calling `app.listen`, and everything assuming a long-lived process is gated behind `if (!process.env.VERCEL)`. When touching the backend:

- **No in-process `node-cron`** — schedules never fire. Recurring work needs a `vercel.json` cron entry hitting an endpoint guarded by `CRON_SECRET`.
- **No module-level mutable state, in-memory caches, `setInterval`, or local disk writes** — they silently break or leak across invocations.
- **Connection reuse is mandatory.** `config/db.js` caches the Mongoose *promise* on `globalThis` so concurrent cold starts share one handshake.
- **Responses cap at ~4.5MB**, which is why backups are limited to 4MB on Vercel.

## Frontend

`frontend/` — React 19 on CRA via craco. 16 pages (~4,000 lines), 7 hand-written components, 12 hooks/lib modules.

**[src/lib/api.js](frontend/src/lib/api.js) is the single API choke point.** One axios instance with a request interceptor attaching `Bearer ${localStorage.token}` and a response interceptor that clears storage and hard-redirects to `/login` on any 401. Every call is a named export (`brandsAPI`, `productionAPI`, …); nothing calls axios directly. Add new endpoints here.

Auth state lives in [src/context/AuthContext.js](frontend/src/context/AuthContext.js). `App.js` wraps pages in `ProtectedRoute`, with `adminOnly` for `/admin`. **Authorization is UI-only** — hiding a page does not protect the endpoint.

Reuse the shared table scaffolding rather than rewriting it per page: `usePagination`, `useTableFilter`, `useTableSort`, `useDebounce`, `TablePagination`, `TableSearch`, `SortableHeader`, `ConfirmDialog`, `SearchableSelect`, `ImportExcelButton`.

[components/Layout.jsx](frontend/src/components/Layout.jsx) is the sidebar + header shell. It fetches nav items from `/api/menu-items` with a hardcoded fallback, resolving icon-name strings through [lib/iconMap.js](frontend/src/lib/iconMap.js).

`components/ui/` is generated shadcn/ui — add via the shadcn CLI, never hand-edit. The `@/` alias resolves only through craco, so always `npx craco build`, never `react-scripts build`.

## Deployment

Both halves deploy by **manual CLI**. There is no CI — no `.github/workflows`, no tests, no build gate. A push to `main` deploys nothing.

```bash
cd backend && npx vercel deploy --prod --yes

cd frontend && REACT_APP_BACKEND_URL=https://timestin-backend.vercel.app \
  npx craco build && npx netlify-cli deploy --prod --dir=build \
  --site=6e3e1c00-9360-4154-85f6-4bfe7e75c2a7 --no-build
```

The only automation is a Vercel Cron entry in [backend/vercel.json](backend/vercel.json) for the monthly backup. [render.yaml](render.yaml) is an unattached standby blueprint from when Render hosted the backend.

Never delete `backend/.vercel` or `frontend/.netlify` — they link the local directories to the deployed projects.

## Known gaps

Verified in the 2026-09-11 review, and worth knowing before you trust the code:

- **No tests exist**, and no runner is installed. ESLint 9 is present but has no flat config, so it only runs inside craco's dev overlay.
- **`react-hook-form` and `zod` are dependencies but unused.** Every form is hand-rolled `useState` plus truthy checks, so negative and non-numeric values reach the backend.
- **Stock guards are incomplete.** Production does not check available printing stock; dispatch does not check available finished goods.
- **Multi-document writes are not transactional.** Dispatch→PO sync, printing-job→sheet deduction, and the production cascade are separate Mongoose calls; a failure midway leaves the collections diverged.
- **`Purchase.sheets_available` is a stored field that is never maintained** and disagrees with the computed value shown on the Raw Material Stock page.
