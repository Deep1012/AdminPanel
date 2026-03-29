# TIMESTIN CRM - Manufacturing CRM System

A full-stack manufacturing CRM for tracking the paint can production pipeline: raw material purchase, printing/coating jobs, production, and dispatch.

## Login Credentials (after initialization)
- **Admin**: admin@crm.com / admin123

## Tech Stack
- **Frontend**: React 19, Tailwind CSS 3, shadcn/ui, Recharts
- **Backend**: Node.js, Express, Mongoose
- **Database**: MongoDB Atlas

## Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
# Edit .env with your MongoDB Atlas URI and JWT secret
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
yarn install
# Edit .env with your backend URL (default: http://localhost:8001)
yarn start
```

### 3. Initialize System
- Open http://localhost:3000
- The system will show "Initialize System" on first launch
- Click it to seed brands, sizes, and admin user
- Login with admin@crm.com / admin123

## Features
- Raw Material Management (auto sheet calculation)
- Printing/Coating Jobs (linked to raw materials, multi-brand support)
- Production Tracking
- Dispatch & Order Management
- Dashboard with Stock Reports & Charts
- Excel Export for all reports
- User Management with lock/unlock (admin only)

## Key Formulas
- **No. of Sheets** = Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)
- **Printing Stock** = Bodies in Job x Sheets from Raw Material
- **Available Printing Stock** = Printing Done - Used in Production

## Project Structure
```
AdminDashboard/
  backend/
    server.js              # Express entry point
    config/db.js           # MongoDB Atlas connection
    middleware/auth.js      # JWT auth + role middleware
    models/                # Mongoose schemas
    routes/                # Express route handlers
  frontend/
    src/
      App.js               # Router + protected routes
      lib/api.js           # Axios API client
      context/AuthContext.js
      components/Layout.jsx # Sidebar + header shell
      components/ui/        # shadcn/ui primitives
      pages/               # Route pages
  memory/                  # Project memory for AI assistants
```

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `CORS_ORIGINS` | Allowed origins (comma-separated or `*`) |
| `PORT` | Server port (default: 8001) |

### Frontend (`frontend/.env`)
| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | Backend URL (default: http://localhost:8001) |
