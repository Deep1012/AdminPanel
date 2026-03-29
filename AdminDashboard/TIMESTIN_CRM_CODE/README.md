# TIMESTIN CRM - Manufacturing CRM System

## Login Credentials (after initialization)
- **Admin**: admin@crm.com / admin123

## Features
- Raw Material Management (with auto sheet calculation)
- Printing/Coating Jobs (linked to raw materials)
- Production Tracking
- Dispatch & Order Management
- Dashboard with Stock Reports
- Excel Export for all reports
- User Management with lock/unlock

## Formulas
- **No. of Sheets** = Weight ÷ (Gauge × Size1 × Size2 ÷ 100000 × 0.785)
- **Printing Stock** = Bodies in Job × Sheets from Raw Material
- **Available Printing Stock** = Printing Done - Used in Production

---

## Quick Start (Local Development)

### 1. Start MongoDB
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:6

# Or install MongoDB locally
```

### 2. Backend Setup
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your settings
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend Setup
```bash
cd frontend
yarn install
cp .env.example .env
# Edit .env with your backend URL
yarn start
```

### 4. Initialize System
- Open http://localhost:3000
- Click "Initialize System" button
- Login with admin@crm.com / admin123

---

## Docker Deployment

### docker-compose.yml
```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    restart: always

  backend:
    build: ./backend
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=timestin_crm
      - JWT_SECRET=your-super-secret-key
      - CORS_ORIGINS=*
    ports:
      - "8001:8001"
    depends_on:
      - mongodb
    restart: always

  frontend:
    build: ./frontend
    environment:
      - REACT_APP_BACKEND_URL=http://your-domain:8001
    ports:
      - "80:3000"
    depends_on:
      - backend
    restart: always

volumes:
  mongo_data:
```

### Backend Dockerfile (backend/Dockerfile)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Frontend Dockerfile (frontend/Dockerfile)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build
RUN npm install -g serve
CMD ["serve", "-s", "build", "-l", "3000"]
```

---

## Project Structure
```
TIMESTIN_CRM_CODE/
├── backend/
│   ├── server.py          # FastAPI backend (all APIs)
│   ├── requirements.txt   # Python dependencies
│   └── .env.example       # Environment template
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React app
│   │   ├── App.css        # App styles
│   │   ├── index.js       # Entry point
│   │   ├── index.css      # Global styles
│   │   ├── lib/
│   │   │   ├── api.js     # API client
│   │   │   └── utils.js   # Utilities
│   │   ├── context/
│   │   │   └── AuthContext.js
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Purchase.jsx
│   │       ├── Printing.jsx
│   │       ├── Production.jsx
│   │       ├── Dispatch.jsx
│   │       └── Admin.jsx
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env.example
└── README.md
```

## Creating Users
1. Login as Admin
2. Go to ADMIN page > Users tab
3. Click "Add User"
4. Fill Username, Email, Password, Role
5. Share the credentials with the user
