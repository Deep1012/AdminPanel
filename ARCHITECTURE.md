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

## Stock formulas vs reality — read this before trusting any stock number

CLAUDE.md documents two invariants that **the live data contradicts**. Measured read-only via `GET /api/admin/reconcile` on 2026-09-11:

```
negative_printing_stock_available   144 of 173 (size, brand) buckets  (83%)
negative_finished_goods_available    59 buckets
production rows                   1,420
production rows linked to a printing job   0     <- not one
printing jobs in the database        50
```

No production row references a printing job, and 59 brand/size pairs have dispatched more than was recorded as produced. The factory records production without the printing behind it and ships inventory that predates the system.

So `Available Printing Stock = Printing Done − Used in Production` and `Finished Goods Available = Produced − Dispatched` describe an **intended** model, not this operation. Guards enforcing them exist but run in warn-only mode — see [backend/lib/availabilityPolicy.js](backend/lib/availabilityPolicy.js), which holds the single `MODE` constant and the measurements behind the decision. A test asserts the mode, so flipping it is deliberate. **Re-run the reconcile endpoint before ever flipping it.**

Guards the data does support are enforced as hard rejections: positive-quantity validation, PO remaining capacity, and raw-material sheet availability (both measured at zero drift).

## Data volumes

~2,000 documents total (Purchase 176, PrintingJob 50, Production 1,420, Dispatch 147, PurchaseOrder 239). Small enough that most scaling work is premature — dashboard aggregation pipelines were explicitly dropped as such. `Production` is the one collection that grows fast, because the cascade writes 4 rows per normal-brand entry and 6 for LWBF brands; it alone has server-side pagination.

The real performance problem is the frontend bundle: **1,543 KB of JavaScript in a single chunk** to render those 2,000 documents.

## Known gaps

Verified in the September 2026 review:

- **Stock guards are reported, not enforced** — see the section above. This is deliberate and measured, not an oversight.
- **`Production` PUT does not re-check availability** when an edit raises `printing_stock_used`, and `printing_stock_used: 0` (what the Excel import sends when the column is blank) bypasses the production check entirely while still recording finished goods.
- **The production availability check cannot be atomic** without transactions — it aggregates over two collections with no counter document to guard, so two simultaneous entries can both pass.
- **No route-level tests.** There is no supertest or HTTP harness; decision logic was extracted into `backend/lib/` and unit-tested there (216 tests), leaving status codes, write ordering and logging verified by inspection only.
- **Multi-document writes are still not transactional.** Where a sequence cannot be made atomic, writes are ordered so the recoverable state is the one you land in — e.g. PO counters move before the dispatch row exists, failing into a PO that looks *more* dispatched than it is (visible and conservative) rather than less. Each such site is commented.
- **41 dangling PO references and one over-dispatched PO** exist in historical data. The fixes prevent recurrence but do not clean up the past; `/api/admin/reconcile` lists them.
- **`/api/admin/reconcile` has no UI** — it is API-only.
