# Git Commit History

## Commit Log

### 2026-03-29 - Initial commit: TIMESTIN CRM with Node.js backend
**Type:** feat
**Description:** Full manufacturing CRM application with Node.js/Express backend and React frontend.

**Changes:**
- Node.js/Express backend with Mongoose ODM (migrated from Python/FastAPI)
- MongoDB Atlas database connection
- JWT authentication with role-based access (admin/user)
- 7 Mongoose models: User, Brand, Size, Purchase, PrintingJob, Production, Dispatch
- 10 route modules: auth, users, brands, sizes, purchases, printingJobs, production, dispatch, dashboard, seed
- React 19 frontend with Tailwind CSS + shadcn/ui
- Industrial dark theme ("Tactical Factory")
- Pages: Login, Dashboard, Purchase, Printing, Production, Dispatch, Admin
- Removed all Emergent/posthog tracking code
- Clean project structure with memory/ for AI context
