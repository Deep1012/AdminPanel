# Manufacturing CRM - Complete Code Export

## Project Structure
```
/app/
├── backend/
│   ├── server.py          # FastAPI backend
│   ├── requirements.txt   # Python dependencies
│   └── .env              # Backend environment
├── frontend/
│   ├── src/
│   │   ├── App.js        # Main React app
│   │   ├── App.css       # App styles
│   │   ├── index.css     # Global styles
│   │   ├── lib/
│   │   │   ├── api.js    # API client
│   │   │   └── utils.js  # Utilities
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
│   ├── package.json
│   └── tailwind.config.js
```

---

## Backend - server.py
```python
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'manufacturing-crm-secret-key-2024')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI(title="Manufacturing CRM API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"  # admin, user

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_locked: bool = False
    created_at: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    is_locked: Optional[bool] = None

# Brand & Size Models
class BrandCreate(BaseModel):
    name: str

class BrandResponse(BaseModel):
    id: str
    name: str
    created_at: str

class SizeCreate(BaseModel):
    name: str

class SizeResponse(BaseModel):
    id: str
    name: str
    created_at: str

# Purchase Models (Raw Material - Metal Sheets)
class PurchaseItemCreate(BaseModel):
    sr_no: str
    gauge: float
    size1: float
    size2: float
    temper: str
    weight: float
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None

class PurchaseItem(BaseModel):
    id: str
    sr_no: str
    gauge: float
    size1: float
    size2: float
    temper: str
    weight: float
    no_of_sheets: int
    sheets_used: int = 0
    sheets_available: int = 0
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None
    purchase_date: str
    created_by: str

# Printing/Coating Job Models
class JobBrandEntry(BaseModel):
    brand_id: str
    brand_name: str
    bodies_count: int

class JobSizeEntry(BaseModel):
    size_id: str
    size_name: str
    brands: List[JobBrandEntry]

class PrintingJobCreate(BaseModel):
    job_number: str
    raw_material_id: str
    sizes: List[JobSizeEntry]
    notes: Optional[str] = None

class PrintingJobResponse(BaseModel):
    id: str
    job_number: str
    raw_material_id: str
    raw_material_sr_no: str
    raw_material_size: str
    sheets_from_material: int
    sizes: List[JobSizeEntry]
    total_bodies: int
    status: str  # pending, in_progress, completed
    notes: Optional[str] = None
    job_date: str
    created_by: str

class PrintingJobUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

# Production Models
class ProductionEntryCreate(BaseModel):
    brand_id: str
    brand_name: str
    size_id: str
    size_name: str
    quantity_produced: int
    printing_job_id: Optional[str] = None
    notes: Optional[str] = None

class ProductionEntryResponse(BaseModel):
    id: str
    brand_id: str
    brand_name: str
    size_id: str
    size_name: str
    quantity_produced: int
    printing_job_id: Optional[str] = None
    notes: Optional[str] = None
    production_date: str
    created_by: str

# Dispatch Models
class DispatchCreate(BaseModel):
    order_number: str
    customer_name: str
    brand_id: str
    brand_name: str
    size_id: str
    size_name: str
    quantity: int
    delivery_address: Optional[str] = None
    notes: Optional[str] = None

class DispatchResponse(BaseModel):
    id: str
    order_number: str
    customer_name: str
    brand_id: str
    brand_name: str
    size_id: str
    size_name: str
    quantity: int
    status: str  # pending, dispatched, delivered
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    dispatch_date: str
    created_by: str

class DispatchUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

# ==================== HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("is_locked"):
            raise HTTPException(status_code=403, detail="Account is locked")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def admin_required(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "role": user_data.role,
        "is_locked": False,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        id=user_id,
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        is_locked=False,
        created_at=now
    )

@api_router.post("/auth/login")
async def login(login_data: UserLogin):
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user or not verify_password(login_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user.get("is_locked"):
        raise HTTPException(status_code=403, detail="Account is locked")
    
    token = create_token(user["id"], user["role"])
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"]
        }
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)

# ==================== USER MANAGEMENT ====================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(admin: dict = Depends(admin_required)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update_data: UserUpdate, admin: dict = Depends(admin_required)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(admin_required)):
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

# ==================== BRANDS ====================

@api_router.post("/brands", response_model=BrandResponse)
async def create_brand(brand_data: BrandCreate, admin: dict = Depends(admin_required)):
    brand_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    doc = {
        "id": brand_id,
        "name": brand_data.name,
        "created_at": now
    }
    await db.brands.insert_one(doc)
    return BrandResponse(**doc)

@api_router.get("/brands", response_model=List[BrandResponse])
async def get_brands(user: dict = Depends(get_current_user)):
    brands = await db.brands.find({}, {"_id": 0}).to_list(1000)
    return [BrandResponse(**b) for b in brands]

@api_router.delete("/brands/{brand_id}")
async def delete_brand(brand_id: str, admin: dict = Depends(admin_required)):
    result = await db.brands.delete_one({"id": brand_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"message": "Brand deleted successfully"}

# ==================== SIZES ====================

@api_router.post("/sizes", response_model=SizeResponse)
async def create_size(size_data: SizeCreate, admin: dict = Depends(admin_required)):
    size_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    doc = {
        "id": size_id,
        "name": size_data.name,
        "created_at": now
    }
    await db.sizes.insert_one(doc)
    return SizeResponse(**doc)

@api_router.get("/sizes", response_model=List[SizeResponse])
async def get_sizes(user: dict = Depends(get_current_user)):
    sizes = await db.sizes.find({}, {"_id": 0}).to_list(1000)
    return [SizeResponse(**s) for s in sizes]

@api_router.delete("/sizes/{size_id}")
async def delete_size(size_id: str, admin: dict = Depends(admin_required)):
    result = await db.sizes.delete_one({"id": size_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Size not found")
    return {"message": "Size deleted successfully"}

# ==================== PURCHASES ====================

@api_router.post("/purchases", response_model=PurchaseItem)
async def create_purchase(purchase_data: PurchaseItemCreate, user: dict = Depends(get_current_user)):
    purchase_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Calculate No of Sheets: WEIGHT / (GAUGE * SIZE1 * SIZE2 / 100000 * 0.785)
    divisor = (purchase_data.gauge * purchase_data.size1 * purchase_data.size2 / 100000) * 0.785
    no_of_sheets = int(purchase_data.weight / divisor) if divisor > 0 else 0
    
    doc = {
        "id": purchase_id,
        "sr_no": purchase_data.sr_no,
        "gauge": purchase_data.gauge,
        "size1": purchase_data.size1,
        "size2": purchase_data.size2,
        "temper": purchase_data.temper,
        "weight": purchase_data.weight,
        "no_of_sheets": no_of_sheets,
        "sheets_used": 0,
        "sheets_available": no_of_sheets,
        "supplier": purchase_data.supplier,
        "invoice_number": purchase_data.invoice_number,
        "purchase_date": now,
        "created_by": user["username"]
    }
    await db.purchases.insert_one(doc)
    return PurchaseItem(**doc)

@api_router.get("/purchases", response_model=List[PurchaseItem])
async def get_purchases(user: dict = Depends(get_current_user)):
    purchases = await db.purchases.find({}, {"_id": 0}).sort("purchase_date", -1).to_list(1000)
    # Ensure sheets_used and sheets_available fields exist
    for p in purchases:
        if "sheets_used" not in p:
            p["sheets_used"] = 0
        if "sheets_available" not in p:
            p["sheets_available"] = p.get("no_of_sheets", 0) - p.get("sheets_used", 0)
    return [PurchaseItem(**p) for p in purchases]

@api_router.get("/purchases/available")
async def get_available_purchases(user: dict = Depends(get_current_user)):
    """Get raw materials with available sheets"""
    purchases = await db.purchases.find({}, {"_id": 0}).sort("purchase_date", -1).to_list(1000)
    available = []
    for p in purchases:
        sheets_used = p.get("sheets_used", 0)
        sheets_available = p.get("no_of_sheets", 0) - sheets_used
        if sheets_available > 0:
            available.append({
                "id": p["id"],
                "sr_no": p["sr_no"],
                "gauge": p["gauge"],
                "size1": p["size1"],
                "size2": p["size2"],
                "temper": p["temper"],
                "no_of_sheets": p["no_of_sheets"],
                "sheets_used": sheets_used,
                "sheets_available": sheets_available,
                "display_name": f"{p['sr_no']} - {p['size1']}x{p['size2']} ({sheets_available} sheets)"
            })
    return available

@api_router.delete("/purchases/{purchase_id}")
async def delete_purchase(purchase_id: str, user: dict = Depends(get_current_user)):
    result = await db.purchases.delete_one({"id": purchase_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return {"message": "Purchase deleted successfully"}

# ==================== PRINTING/COATING JOBS ====================

@api_router.post("/printing-jobs", response_model=PrintingJobResponse)
async def create_printing_job(job_data: PrintingJobCreate, user: dict = Depends(get_current_user)):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Get raw material info
    raw_material = await db.purchases.find_one({"id": job_data.raw_material_id}, {"_id": 0})
    if not raw_material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    
    sheets_available = raw_material.get("no_of_sheets", 0) - raw_material.get("sheets_used", 0)
    if sheets_available <= 0:
        raise HTTPException(status_code=400, detail="No sheets available from this raw material")
    
    # Calculate total bodies from all sizes
    total_bodies = 0
    for size_entry in job_data.sizes:
        for brand in size_entry.brands:
            total_bodies += brand.bodies_count
    
    doc = {
        "id": job_id,
        "job_number": job_data.job_number,
        "raw_material_id": job_data.raw_material_id,
        "raw_material_sr_no": raw_material["sr_no"],
        "raw_material_size": f"{raw_material['size1']}x{raw_material['size2']}",
        "sheets_from_material": sheets_available,
        "sizes": [s.model_dump() for s in job_data.sizes],
        "total_bodies": total_bodies,
        "status": "pending",
        "notes": job_data.notes,
        "job_date": now,
        "created_by": user["username"]
    }
    await db.printing_jobs.insert_one(doc)
    
    # Update raw material sheets_used
    await db.purchases.update_one(
        {"id": job_data.raw_material_id},
        {"$set": {"sheets_used": raw_material.get("sheets_used", 0) + sheets_available}}
    )
    
    return PrintingJobResponse(**doc)

@api_router.get("/printing-jobs", response_model=List[PrintingJobResponse])
async def get_printing_jobs(user: dict = Depends(get_current_user)):
    jobs = await db.printing_jobs.find({}, {"_id": 0}).sort("job_date", -1).to_list(1000)
    result = []
    for j in jobs:
        # Handle old jobs that might not have new fields
        if "raw_material_sr_no" not in j:
            j["raw_material_sr_no"] = "N/A"
        if "raw_material_size" not in j:
            j["raw_material_size"] = "N/A"
        if "sheets_from_material" not in j:
            j["sheets_from_material"] = 0
        if "raw_material_id" not in j:
            j["raw_material_id"] = ""
        if "sizes" not in j:
            # Convert old format to new format
            j["sizes"] = [{
                "size_id": j.get("size_id", ""),
                "size_name": j.get("size_name", "N/A"),
                "brands": j.get("brands", [])
            }]
        result.append(PrintingJobResponse(**j))
    return result

@api_router.put("/printing-jobs/{job_id}")
async def update_printing_job(job_id: str, update_data: PrintingJobUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.printing_jobs.update_one({"id": job_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {"message": "Job updated successfully"}

@api_router.delete("/printing-jobs/{job_id}")
async def delete_printing_job(job_id: str, user: dict = Depends(get_current_user)):
    result = await db.printing_jobs.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job deleted successfully"}

# ==================== PRODUCTION ====================

@api_router.post("/production", response_model=ProductionEntryResponse)
async def create_production(prod_data: ProductionEntryCreate, user: dict = Depends(get_current_user)):
    prod_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    doc = {
        "id": prod_id,
        "brand_id": prod_data.brand_id,
        "brand_name": prod_data.brand_name,
        "size_id": prod_data.size_id,
        "size_name": prod_data.size_name,
        "quantity_produced": prod_data.quantity_produced,
        "printing_job_id": prod_data.printing_job_id,
        "notes": prod_data.notes,
        "production_date": now,
        "created_by": user["username"]
    }
    await db.production.insert_one(doc)
    return ProductionEntryResponse(**doc)

@api_router.get("/production", response_model=List[ProductionEntryResponse])
async def get_production(user: dict = Depends(get_current_user)):
    entries = await db.production.find({}, {"_id": 0}).sort("production_date", -1).to_list(1000)
    return [ProductionEntryResponse(**e) for e in entries]

@api_router.delete("/production/{prod_id}")
async def delete_production(prod_id: str, user: dict = Depends(get_current_user)):
    result = await db.production.delete_one({"id": prod_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Production entry not found")
    return {"message": "Production entry deleted successfully"}

# ==================== DISPATCH ====================

@api_router.post("/dispatch", response_model=DispatchResponse)
async def create_dispatch(dispatch_data: DispatchCreate, user: dict = Depends(get_current_user)):
    dispatch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    doc = {
        "id": dispatch_id,
        "order_number": dispatch_data.order_number,
        "customer_name": dispatch_data.customer_name,
        "brand_id": dispatch_data.brand_id,
        "brand_name": dispatch_data.brand_name,
        "size_id": dispatch_data.size_id,
        "size_name": dispatch_data.size_name,
        "quantity": dispatch_data.quantity,
        "status": "pending",
        "delivery_address": dispatch_data.delivery_address,
        "notes": dispatch_data.notes,
        "dispatch_date": now,
        "created_by": user["username"]
    }
    await db.dispatch.insert_one(doc)
    return DispatchResponse(**doc)

@api_router.get("/dispatch", response_model=List[DispatchResponse])
async def get_dispatch(user: dict = Depends(get_current_user)):
    entries = await db.dispatch.find({}, {"_id": 0}).sort("dispatch_date", -1).to_list(1000)
    return [DispatchResponse(**e) for e in entries]

@api_router.put("/dispatch/{dispatch_id}")
async def update_dispatch(dispatch_id: str, update_data: DispatchUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.dispatch.update_one({"id": dispatch_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    return {"message": "Dispatch updated successfully"}

@api_router.delete("/dispatch/{dispatch_id}")
async def delete_dispatch(dispatch_id: str, user: dict = Depends(get_current_user)):
    result = await db.dispatch.delete_one({"id": dispatch_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    return {"message": "Dispatch deleted successfully"}

# ==================== DASHBOARD ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    # Printing/Coating Stock (total bodies from completed jobs)
    printing_jobs = await db.printing_jobs.find({}, {"_id": 0}).to_list(1000)
    total_printed_bodies = sum(j.get("total_bodies", 0) for j in printing_jobs)
    pending_jobs = sum(1 for j in printing_jobs if j.get("status") == "pending")
    completed_jobs = sum(1 for j in printing_jobs if j.get("status") == "completed")
    total_sheets_used = sum(j.get("sheets_from_material", 0) for j in printing_jobs)
    
    # Finished Goods (total produced)
    production = await db.production.find({}, {"_id": 0}).to_list(1000)
    total_finished_goods = sum(p.get("quantity_produced", 0) for p in production)
    
    # Dispatch Stats
    dispatches = await db.dispatch.find({}, {"_id": 0}).to_list(1000)
    total_dispatched = sum(d.get("quantity", 0) for d in dispatches if d.get("status") == "dispatched")
    pending_orders = sum(1 for d in dispatches if d.get("status") == "pending")
    
    # Purchase Stats
    purchases = await db.purchases.find({}, {"_id": 0}).to_list(1000)
    total_sheets = sum(p.get("no_of_sheets", 0) for p in purchases)
    total_sheets_available = sum(p.get("no_of_sheets", 0) - p.get("sheets_used", 0) for p in purchases)
    total_weight = sum(p.get("weight", 0) for p in purchases)
    
    return {
        "printing_coating": {
            "total_bodies": total_printed_bodies,
            "pending_jobs": pending_jobs,
            "completed_jobs": completed_jobs,
            "total_sheets_used": total_sheets_used
        },
        "finished_goods": {
            "total_produced": total_finished_goods,
            "available_stock": total_finished_goods - total_dispatched
        },
        "dispatch": {
            "total_dispatched": total_dispatched,
            "pending_orders": pending_orders
        },
        "purchase": {
            "total_sheets": total_sheets,
            "total_sheets_available": total_sheets_available,
            "total_weight": total_weight,
            "total_items": len(purchases)
        }
    }

@api_router.get("/dashboard/stock-by-brand")
async def get_stock_by_brand(user: dict = Depends(get_current_user)):
    # Get production by brand
    production = await db.production.find({}, {"_id": 0}).to_list(1000)
    dispatches = await db.dispatch.find({}, {"_id": 0}).to_list(1000)
    
    stock_map = {}
    
    # Add production
    for p in production:
        key = f"{p['brand_name']}_{p['size_name']}"
        if key not in stock_map:
            stock_map[key] = {
                "brand_name": p["brand_name"],
                "size_name": p["size_name"],
                "produced": 0,
                "dispatched": 0
            }
        stock_map[key]["produced"] += p.get("quantity_produced", 0)
    
    # Subtract dispatched
    for d in dispatches:
        if d.get("status") in ["dispatched", "delivered"]:
            key = f"{d['brand_name']}_{d['size_name']}"
            if key in stock_map:
                stock_map[key]["dispatched"] += d.get("quantity", 0)
    
    result = []
    for key, val in stock_map.items():
        result.append({
            "brand_name": val["brand_name"],
            "size_name": val["size_name"],
            "produced": val["produced"],
            "dispatched": val["dispatched"],
            "available": val["produced"] - val["dispatched"]
        })
    
    return result

@api_router.get("/dashboard/printing-stock")
async def get_printing_stock(user: dict = Depends(get_current_user)):
    """Get printing/coating bodies stock by brand and size"""
    jobs = await db.printing_jobs.find({}, {"_id": 0}).to_list(1000)
    
    stock_map = {}
    for job in jobs:
        # Handle new format with multiple sizes
        sizes = job.get("sizes", [])
        if not sizes and job.get("brands"):
            # Old format - single size
            sizes = [{
                "size_name": job.get("size_name", "Unknown"),
                "brands": job.get("brands", [])
            }]
        
        for size_entry in sizes:
            size_name = size_entry.get("size_name", "Unknown")
            for brand in size_entry.get("brands", []):
                key = f"{brand['brand_name']}_{size_name}"
                if key not in stock_map:
                    stock_map[key] = {
                        "brand_name": brand["brand_name"],
                        "size_name": size_name,
                        "total_bodies": 0,
                        "job_count": 0
                    }
                stock_map[key]["total_bodies"] += brand.get("bodies_count", 0)
                stock_map[key]["job_count"] += 1
            stock_map[key]["job_count"] += 1
    
    return list(stock_map.values())

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    """Seed initial brands and sizes"""
    
    # Default Sizes
    sizes = [
        "4LTR/5KG", "1LTR", "500ML", "200ML/250ML", "1KG", "1/2KG"
    ]
    
    # Default Brands
    brands = [
        "SANDING SEALER", "SYNCOAT", "SUPERSET", "SWAGAT", "A.O.P", "AUTOCOAT",
        "CELLOCOAT", "SUPER EPOXY", "SYNCOAT EPOXY", "SYNCOAT COMMERCIAL",
        "S/E SATIN FINISH", "SYNCOAT EPOXY HARDNER", "AUTOCOAT ACRYLIC 1K PRIMER",
        "PROF. SANDING SEALER", "MELAMINE", "PROF. MELAMINE", "SYNCOAT 1K",
        "SYNCOAT DECORATIVE", "SYNCOAT HAMMERTONE", "SYNCOAT Q.D.",
        "QD 1K EPOXY PRIMER", "SYNCOAT STIPPLE FINISH", "SYNCOAT ZINC ETECH PRIMER",
        "SUPERPOL", "A/COAT PU COATING BASE", "A/COAT COMM. PU BASE",
        "A/COAT 2-COAT METALLIC BASE", "A/COAT PU COATING BASE W/O HANDLE",
        "A/COAT UNIVERSAL FINISH", "SPEED", "CELLOFIX", "SWAGAT FURNITURE ENAMEL",
        "7KG AUTOCOAT PUTTY", "CELLOCOAT SPARKLE", "SWAGAT RED OXIDE",
        "SWAGAT TRUCK ENAMEL", "U.W. CLEAR", "WOODFILLER", "METALLIC",
        "SUPER EPOXY HARDNER", "WOODFINISH", "2KG LWBF", "CELLOCOAT NC PUTTY",
        "AUTOCOAT PUTTY", "LWBF", "B/FILLER", "COMM LWBF", "COMM B/FILLER",
        "IND. PUTTY", "AUTOCOAT IND PUTTY", "1.5KG AUTOCOAT PUTTY", "ESQ CLASSIC",
        "PRIDE PUTTY", "PRO. SWAGAT", "LID", "BOTTOM", "TOP", "SUNLAN", "SABAR",
        "PASHMINA", "RICHGOLD", "ORBIT", "NAVDEEP", "UMA", "SONATA", "LID LWBF",
        "BOTTOM LWBF", "SHRIJI", "PLAIN", "COMM SANDING SEALER"
    ]
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Clear existing
    await db.sizes.delete_many({})
    await db.brands.delete_many({})
    
    # Insert sizes
    size_docs = [{"id": str(uuid.uuid4()), "name": s, "created_at": now} for s in sizes]
    await db.sizes.insert_many(size_docs)
    
    # Insert brands
    brand_docs = [{"id": str(uuid.uuid4()), "name": b, "created_at": now} for b in brands]
    await db.brands.insert_many(brand_docs)
    
    # Create admin user if not exists
    admin_exists = await db.users.find_one({"email": "admin@crm.com"})
    if not admin_exists:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "username": "Admin",
            "email": "admin@crm.com",
            "password": hash_password("admin123"),
            "role": "admin",
            "is_locked": False,
            "created_at": now
        }
        await db.users.insert_one(admin_doc)
    
    return {
        "message": "Seed data created successfully",
        "sizes_created": len(sizes),
        "brands_created": len(brands)
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Manufacturing CRM API is running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
```


## Frontend - App.js
```javascript
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Purchase from './pages/Purchase';
import Printing from './pages/Printing';
import Production from './pages/Production';
import Dispatch from './pages/Dispatch';
import Admin from './pages/Admin';
import './App.css';

// Protected Route component
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { user, loading, isAdmin } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && !isAdmin()) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Layout>{children}</Layout>;
};

// Public Route (redirects to dashboard if logged in)
const PublicRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={
                <PublicRoute>
                    <Login />
                </PublicRoute>
            } />
            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <Dashboard />
                </ProtectedRoute>
            } />
            <Route path="/purchase" element={
                <ProtectedRoute>
                    <Purchase />
                </ProtectedRoute>
            } />
            <Route path="/printing" element={
                <ProtectedRoute>
                    <Printing />
                </ProtectedRoute>
            } />
            <Route path="/production" element={
                <ProtectedRoute>
                    <Production />
                </ProtectedRoute>
            } />
            <Route path="/dispatch" element={
                <ProtectedRoute>
                    <Dispatch />
                </ProtectedRoute>
            } />
            <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                    <Admin />
                </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <div className="App dark">
                    <AppRoutes />
                    <Toaster position="bottom-right" richColors />
                </div>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
```


## Frontend - App.css
```javascript
.App {
    min-height: 100vh;
}

/* Status badge colors */
.status-pending {
    @apply bg-yellow-500/20 text-yellow-400 border border-yellow-500/30;
}

.status-completed,
.status-dispatched,
.status-delivered {
    @apply bg-green-500/20 text-green-400 border border-green-500/30;
}

.status-in_progress {
    @apply bg-blue-500/20 text-blue-400 border border-blue-500/30;
}

/* Glow effect for primary elements */
.glow-primary {
    box-shadow: 0 0 20px hsl(24 95% 48% / 0.3);
}

/* Industrial card style */
.industrial-card {
    @apply bg-card border border-border rounded-sm;
}
```


## Frontend - index.css
```javascript
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
    :root {
        --background: 240 10% 3.9%;
        --foreground: 0 0% 98%;
        --card: 240 10% 7%;
        --card-foreground: 0 0% 98%;
        --popover: 240 10% 3.9%;
        --popover-foreground: 0 0% 98%;
        --primary: 24 95% 48%;
        --primary-foreground: 0 0% 98%;
        --secondary: 240 4% 16%;
        --secondary-foreground: 0 0% 98%;
        --muted: 240 4% 16%;
        --muted-foreground: 240 5% 65%;
        --accent: 240 4% 16%;
        --accent-foreground: 0 0% 98%;
        --destructive: 0 84% 60%;
        --destructive-foreground: 0 0% 98%;
        --border: 240 4% 16%;
        --input: 240 4% 16%;
        --ring: 24 95% 48%;
        --chart-1: 24 95% 48%;
        --chart-2: 142 71% 45%;
        --chart-3: 199 89% 48%;
        --chart-4: 48 96% 53%;
        --chart-5: 262 83% 58%;
        --radius: 0.25rem;
        --success: 142 71% 45%;
        --warning: 48 96% 53%;
        --danger: 0 84% 60%;
        --info: 217 91% 60%;
    }
}

@layer base {
    * {
        @apply border-border;
    }
    
    body {
        @apply bg-background text-foreground;
        font-family: 'IBM Plex Sans', sans-serif;
    }
    
    h1, h2, h3, h4, h5, h6 {
        font-family: 'Barlow Condensed', sans-serif;
    }
    
    code, pre, .font-mono {
        font-family: 'JetBrains Mono', monospace;
    }
}

@layer base {
    [data-debug-wrapper="true"] {
        display: contents !important;
    }

    [data-debug-wrapper="true"] > * {
        margin-left: inherit;
        margin-right: inherit;
        margin-top: inherit;
        margin-bottom: inherit;
        padding-left: inherit;
        padding-right: inherit;
        padding-top: inherit;
        padding-bottom: inherit;
        column-gap: inherit;
        row-gap: inherit;
        gap: inherit;
        border-left-width: inherit;
        border-right-width: inherit;
        border-top-width: inherit;
        border-bottom-width: inherit;
        border-left-style: inherit;
        border-right-style: inherit;
        border-top-style: inherit;
        border-bottom-style: inherit;
        border-left-color: inherit;
        border-right-color: inherit;
        border-top-color: inherit;
        border-bottom-color: inherit;
    }
}

/* Custom scrollbar */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: hsl(var(--background));
}

::-webkit-scrollbar-thumb {
    background: hsl(var(--muted));
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground));
}

/* Data table styles */
.data-table {
    width: 100%;
    border-collapse: collapse;
}

.data-table th {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--secondary) / 0.5);
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid hsl(var(--border));
}

.data-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid hsl(var(--border));
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
}

.data-table tr:hover td {
    background: hsl(var(--muted) / 0.5);
}

/* Status badges */
.status-pending {
    background: hsl(48 96% 53% / 0.2);
    color: hsl(48 96% 53%);
    border: 1px solid hsl(48 96% 53% / 0.3);
    padding: 0.25rem 0.5rem;
    border-radius: 0.125rem;
    font-size: 0.75rem;
    font-weight: 600;
}

.status-completed,
.status-dispatched,
.status-delivered {
    background: hsl(142 71% 45% / 0.2);
    color: hsl(142 71% 45%);
    border: 1px solid hsl(142 71% 45% / 0.3);
    padding: 0.25rem 0.5rem;
    border-radius: 0.125rem;
    font-size: 0.75rem;
    font-weight: 600;
}

.status-in_progress {
    background: hsl(217 91% 60% / 0.2);
    color: hsl(217 91% 60%);
    border: 1px solid hsl(217 91% 60% / 0.3);
    padding: 0.25rem 0.5rem;
    border-radius: 0.125rem;
    font-size: 0.75rem;
    font-weight: 600;
}

/* Glow effect for primary elements */
.glow-primary {
    box-shadow: 0 0 20px hsl(24 95% 48% / 0.3);
}

/* Industrial card style */
.industrial-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 0.125rem;
}
```


## Frontend - api.js
```javascript
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth APIs
export const authAPI = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    register: (data) => api.post('/auth/register', data),
    getMe: () => api.get('/auth/me'),
};

// Users APIs
export const usersAPI = {
    getAll: () => api.get('/users'),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
};

// Brands APIs
export const brandsAPI = {
    getAll: () => api.get('/brands'),
    create: (data) => api.post('/brands', data),
    delete: (id) => api.delete(`/brands/${id}`),
};

// Sizes APIs
export const sizesAPI = {
    getAll: () => api.get('/sizes'),
    create: (data) => api.post('/sizes', data),
    delete: (id) => api.delete(`/sizes/${id}`),
};

// Purchase APIs
export const purchaseAPI = {
    getAll: () => api.get('/purchases'),
    getAvailable: () => api.get('/purchases/available'),
    create: (data) => api.post('/purchases', data),
    delete: (id) => api.delete(`/purchases/${id}`),
};

// Printing Jobs APIs
export const printingAPI = {
    getAll: () => api.get('/printing-jobs'),
    create: (data) => api.post('/printing-jobs', data),
    update: (id, data) => api.put(`/printing-jobs/${id}`, data),
    delete: (id) => api.delete(`/printing-jobs/${id}`),
};

// Production APIs
export const productionAPI = {
    getAll: () => api.get('/production'),
    create: (data) => api.post('/production', data),
    delete: (id) => api.delete(`/production/${id}`),
};

// Dispatch APIs
export const dispatchAPI = {
    getAll: () => api.get('/dispatch'),
    create: (data) => api.post('/dispatch', data),
    update: (id, data) => api.put(`/dispatch/${id}`, data),
    delete: (id) => api.delete(`/dispatch/${id}`),
};

// Dashboard APIs
export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getStockByBrand: () => api.get('/dashboard/stock-by-brand'),
    getPrintingStock: () => api.get('/dashboard/printing-stock'),
};

// Seed Data
export const seedAPI = {
    seed: () => api.post('/seed'),
};

export default api;
```


## Frontend - utils.js
```javascript
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

export function formatNumber(num) {
    return new Intl.NumberFormat('en-IN').format(num);
}

export function getStatusColor(status) {
    const statusMap = {
        pending: 'status-pending',
        in_progress: 'status-in_progress',
        completed: 'status-completed',
        dispatched: 'status-dispatched',
        delivered: 'status-delivered',
    };
    return statusMap[status] || 'status-pending';
}
```


## Frontend - AuthContext.js
```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        
        if (token && storedUser) {
            setUser(JSON.parse(storedUser));
            // Verify token is still valid
            authAPI.getMe()
                .then(res => {
                    setUser(res.data);
                    localStorage.setItem('user', JSON.stringify(res.data));
                })
                .catch(() => {
                    logout();
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email, password) => {
        const response = await authAPI.login(email, password);
        const { token, user: userData } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        return userData;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    const isAdmin = () => {
        return user?.role === 'admin';
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
```


## Frontend - Layout.jsx
```javascript
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { 
    LayoutDashboard, 
    ShoppingCart, 
    Printer, 
    Factory, 
    Truck, 
    Settings, 
    LogOut,
    Menu,
    X,
    Package,
    User
} from 'lucide-react';

const navItems = [
    { path: '/dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
    { path: '/purchase', label: 'PURCHASE', icon: ShoppingCart },
    { path: '/printing', label: 'PRINTING/COATING', icon: Printer },
    { path: '/production', label: 'PRODUCTION', icon: Factory },
    { path: '/dispatch', label: 'DISPATCH', icon: Truck },
    { path: '/admin', label: 'ADMIN', icon: Settings, adminOnly: true },
];

export const Layout = ({ children }) => {
    const { user, logout, isAdmin } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin());

    return (
        <div className="min-h-screen bg-background flex" data-testid="main-layout">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside 
                className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}
                data-testid="sidebar"
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-3">
                            <Package className="w-8 h-8 text-primary" />
                            <div>
                                <h1 className="font-display text-xl font-bold tracking-tight uppercase text-foreground">
                                    MFGCRM
                                </h1>
                                <p className="text-xs text-muted-foreground tracking-widest uppercase">
                                    Manufacturing CRM
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1">
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-bold uppercase tracking-wider transition-all duration-150 ${
                                        isActive
                                            ? 'bg-primary text-primary-foreground glow-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                    data-testid={`nav-${item.path.slice(1)}`}
                                >
                                    <Icon className="w-5 h-5" />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User info */}
                    <div className="p-4 border-t border-border">
                        <div className="flex items-center gap-3 px-4 py-3 rounded-sm bg-secondary/50">
                            <User className="w-5 h-5 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user?.username}</p>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                    {user?.role}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full mt-2 justify-start gap-3 text-muted-foreground hover:text-destructive"
                            onClick={handleLogout}
                            data-testid="logout-btn"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="uppercase tracking-wider text-sm font-bold">Logout</span>
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-4 lg:px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            data-testid="mobile-menu-btn"
                        >
                            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </Button>
                        <div className="flex-1">
                            <h2 className="font-display text-2xl font-bold tracking-tight uppercase">
                                {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
                            </h2>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 lg:p-6 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
```


## Frontend - pages/Admin.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { usersAPI, brandsAPI, sizesAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Users, Tag, Ruler, Loader2, AlertCircle, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';

const Admin = () => {
    const [users, setUsers] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Dialog states
    const [brandDialogOpen, setBrandDialogOpen] = useState(false);
    const [sizeDialogOpen, setSizeDialogOpen] = useState(false);
    const [newBrand, setNewBrand] = useState('');
    const [newSize, setNewSize] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, brandsRes, sizesRes] = await Promise.all([
                usersAPI.getAll(),
                brandsAPI.getAll(),
                sizesAPI.getAll()
            ]);
            setUsers(usersRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
        } catch (err) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    // User management
    const handleToggleLock = async (userId, currentLock) => {
        try {
            await usersAPI.update(userId, { is_locked: !currentLock });
            toast.success(`User ${!currentLock ? 'locked' : 'unlocked'}`);
            fetchData();
        } catch (err) {
            toast.error('Failed to update user');
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        
        try {
            await usersAPI.delete(userId);
            toast.success('User deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete user');
        }
    };

    // Brand management
    const handleAddBrand = async (e) => {
        e.preventDefault();
        if (!newBrand.trim()) {
            toast.error('Please enter a brand name');
            return;
        }

        setSubmitting(true);
        try {
            await brandsAPI.create({ name: newBrand.trim().toUpperCase() });
            toast.success('Brand added');
            setNewBrand('');
            setBrandDialogOpen(false);
            fetchData();
        } catch (err) {
            toast.error('Failed to add brand');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteBrand = async (brandId) => {
        if (!window.confirm('Are you sure you want to delete this brand?')) return;
        
        try {
            await brandsAPI.delete(brandId);
            toast.success('Brand deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete brand');
        }
    };

    // Size management
    const handleAddSize = async (e) => {
        e.preventDefault();
        if (!newSize.trim()) {
            toast.error('Please enter a size');
            return;
        }

        setSubmitting(true);
        try {
            await sizesAPI.create({ name: newSize.trim().toUpperCase() });
            toast.success('Size added');
            setNewSize('');
            setSizeDialogOpen(false);
            fetchData();
        } catch (err) {
            toast.error('Failed to add size');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteSize = async (sizeId) => {
        if (!window.confirm('Are you sure you want to delete this size?')) return;
        
        try {
            await sizesAPI.delete(sizeId);
            toast.success('Size deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete size');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64" data-testid="admin-loading">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="admin-page">
            <div>
                <p className="text-muted-foreground">
                    Manage users, brands, and container sizes
                </p>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList className="bg-secondary/50 rounded-sm">
                    <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm font-bold uppercase tracking-wider text-sm">
                        <Users className="w-4 h-4 mr-2" />
                        Users
                    </TabsTrigger>
                    <TabsTrigger value="brands" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm font-bold uppercase tracking-wider text-sm">
                        <Tag className="w-4 h-4 mr-2" />
                        Brands
                    </TabsTrigger>
                    <TabsTrigger value="sizes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm font-bold uppercase tracking-wider text-sm">
                        <Ruler className="w-4 h-4 mr-2" />
                        Sizes
                    </TabsTrigger>
                </TabsList>

                {/* Users Tab */}
                <TabsContent value="users">
                    <Card className="industrial-card">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                User Management
                            </CardTitle>
                            <Badge variant="outline">{users.length} users</Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            {users.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                                    <AlertCircle className="w-8 h-8 mb-2" />
                                    <p>No users found</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="data-table" data-testid="users-table">
                                        <thead>
                                            <tr>
                                                <th>Username</th>
                                                <th>Email</th>
                                                <th>Role</th>
                                                <th>Created</th>
                                                <th>Locked</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map((user) => (
                                                <tr key={user.id} data-testid={`user-row-${user.id}`}>
                                                    <td className="font-medium">{user.username}</td>
                                                    <td className="font-mono text-muted-foreground">{user.email}</td>
                                                    <td>
                                                        <Badge 
                                                            variant={user.role === 'admin' ? 'default' : 'secondary'}
                                                            className="uppercase"
                                                        >
                                                            {user.role}
                                                        </Badge>
                                                    </td>
                                                    <td>{formatDate(user.created_at)}</td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            {user.is_locked ? (
                                                                <Lock className="w-4 h-4 text-destructive" />
                                                            ) : (
                                                                <Unlock className="w-4 h-4 text-success" />
                                                            )}
                                                            <Switch
                                                                checked={user.is_locked}
                                                                onCheckedChange={() => handleToggleLock(user.id, user.is_locked)}
                                                                data-testid={`lock-user-${user.id}`}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteUser(user.id)}
                                                            className="text-muted-foreground hover:text-destructive"
                                                            data-testid={`delete-user-${user.id}`}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Brands Tab */}
                <TabsContent value="brands">
                    <Card className="industrial-card">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Brand Management
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{brands.length} brands</Badge>
                                <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-brand-btn">
                                            <Plus className="w-4 h-4 mr-1" />
                                            Add
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                                        <DialogHeader>
                                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                                Add Brand
                                            </DialogTitle>
                                        </DialogHeader>
                                        <form onSubmit={handleAddBrand} className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                                    Brand Name
                                                </Label>
                                                <Input
                                                    value={newBrand}
                                                    onChange={(e) => setNewBrand(e.target.value)}
                                                    placeholder="e.g., SYNCOAT PREMIUM"
                                                    className="bg-background border-input rounded-sm"
                                                    data-testid="new-brand-input"
                                                />
                                            </div>
                                            <Button 
                                                type="submit" 
                                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                                disabled={submitting}
                                                data-testid="submit-brand"
                                            >
                                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Brand'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2 max-h-96 overflow-y-auto" data-testid="brands-list">
                                {brands.map((brand) => (
                                    <Badge 
                                        key={brand.id} 
                                        variant="secondary"
                                        className="px-3 py-2 text-sm flex items-center gap-2"
                                    >
                                        {brand.name}
                                        <button
                                            onClick={() => handleDeleteBrand(brand.id)}
                                            className="hover:text-destructive transition-colors"
                                            data-testid={`delete-brand-${brand.id}`}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Sizes Tab */}
                <TabsContent value="sizes">
                    <Card className="industrial-card">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Size Management
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{sizes.length} sizes</Badge>
                                <Dialog open={sizeDialogOpen} onOpenChange={setSizeDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-size-btn">
                                            <Plus className="w-4 h-4 mr-1" />
                                            Add
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                                        <DialogHeader>
                                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                                Add Size
                                            </DialogTitle>
                                        </DialogHeader>
                                        <form onSubmit={handleAddSize} className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                                    Size Name
                                                </Label>
                                                <Input
                                                    value={newSize}
                                                    onChange={(e) => setNewSize(e.target.value)}
                                                    placeholder="e.g., 2LTR"
                                                    className="bg-background border-input rounded-sm"
                                                    data-testid="new-size-input"
                                                />
                                            </div>
                                            <Button 
                                                type="submit" 
                                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                                disabled={submitting}
                                                data-testid="submit-size"
                                            >
                                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Size'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2" data-testid="sizes-list">
                                {sizes.map((size) => (
                                    <Badge 
                                        key={size.id} 
                                        variant="outline"
                                        className="px-4 py-2 text-sm flex items-center gap-2 border-primary/30"
                                    >
                                        {size.name}
                                        <button
                                            onClick={() => handleDeleteSize(size.id)}
                                            className="hover:text-destructive transition-colors"
                                            data-testid={`delete-size-${size.id}`}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default Admin;
```


## Frontend - pages/Dashboard.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { dashboardAPI } from '../lib/api';
import { formatNumber } from '../lib/utils';
import { 
    Package, 
    Printer, 
    Factory, 
    Truck, 
    ShoppingCart,
    TrendingUp,
    AlertCircle,
    Loader2
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';

const CHART_COLORS = ['#ea580c', '#22c55e', '#0ea5e9', '#eab308', '#8b5cf6'];

const StatCard = ({ title, value, subtitle, icon: Icon, trend, color = 'primary' }) => (
    <Card className="industrial-card" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        <CardContent className="p-6">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {title}
                    </p>
                    <p className="font-display text-3xl font-bold tracking-tight">
                        {value}
                    </p>
                    {subtitle && (
                        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
                    )}
                </div>
                <div className={`p-3 rounded-sm bg-${color}/10 border border-${color}/20`}>
                    <Icon className={`w-6 h-6 text-${color}`} />
                </div>
            </div>
            {trend && (
                <div className="flex items-center gap-1 mt-4 text-sm text-success">
                    <TrendingUp className="w-4 h-4" />
                    <span>{trend}</span>
                </div>
            )}
        </CardContent>
    </Card>
);

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [stockByBrand, setStockByBrand] = useState([]);
    const [printingStock, setPrintingStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [statsRes, stockRes, printingRes] = await Promise.all([
                dashboardAPI.getStats(),
                dashboardAPI.getStockByBrand(),
                dashboardAPI.getPrintingStock()
            ]);
            setStats(statsRes.data);
            setStockByBrand(stockRes.data);
            setPrintingStock(printingRes.data);
        } catch (err) {
            setError('Failed to load dashboard data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64" data-testid="dashboard-loading">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-destructive" data-testid="dashboard-error">
                <AlertCircle className="w-6 h-6 mr-2" />
                {error}
            </div>
        );
    }

    // Prepare chart data
    const topStockData = stockByBrand
        .sort((a, b) => b.available - a.available)
        .slice(0, 8)
        .map(item => ({
            name: `${item.brand_name.slice(0, 12)}...`,
            fullName: `${item.brand_name} (${item.size_name})`,
            stock: item.available,
            produced: item.produced,
            dispatched: item.dispatched
        }));

    const printingChartData = printingStock
        .sort((a, b) => b.total_bodies - a.total_bodies)
        .slice(0, 8)
        .map(item => ({
            name: `${item.brand_name.slice(0, 12)}...`,
            fullName: `${item.brand_name} (${item.size_name})`,
            bodies: item.total_bodies
        }));

    const pieData = [
        { name: 'Produced', value: stats?.finished_goods?.total_produced || 0 },
        { name: 'Dispatched', value: stats?.dispatch?.total_dispatched || 0 },
        { name: 'Available', value: stats?.finished_goods?.available_stock || 0 }
    ];

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Printing Stock"
                    value={formatNumber(stats?.printing_coating?.total_bodies || 0)}
                    subtitle={`${stats?.printing_coating?.completed_jobs || 0} jobs completed`}
                    icon={Printer}
                    color="primary"
                />
                <StatCard
                    title="Finished Goods"
                    value={formatNumber(stats?.finished_goods?.available_stock || 0)}
                    subtitle={`${formatNumber(stats?.finished_goods?.total_produced || 0)} total produced`}
                    icon={Package}
                    color="success"
                />
                <StatCard
                    title="Pending Orders"
                    value={formatNumber(stats?.dispatch?.pending_orders || 0)}
                    subtitle={`${formatNumber(stats?.dispatch?.total_dispatched || 0)} dispatched`}
                    icon={Truck}
                    color="warning"
                />
                <StatCard
                    title="Available Sheets"
                    value={formatNumber(stats?.purchase?.total_sheets_available || 0)}
                    subtitle={`${formatNumber(stats?.purchase?.total_sheets || 0)} total sheets`}
                    icon={ShoppingCart}
                    color="info"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Finished Goods Stock Chart */}
                <Card className="industrial-card" data-testid="finished-goods-chart">
                    <CardHeader>
                        <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                            <Factory className="w-5 h-5 text-primary" />
                            Finished Goods Stock
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {topStockData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topStockData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis type="number" stroke="#a1a1aa" fontSize={12} />
                                    <YAxis 
                                        type="category" 
                                        dataKey="name" 
                                        stroke="#a1a1aa" 
                                        fontSize={11}
                                        width={100}
                                    />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#18181b', 
                                            border: '1px solid #27272a',
                                            borderRadius: '2px'
                                        }}
                                        labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
                                    />
                                    <Bar dataKey="stock" fill="#22c55e" radius={[0, 2, 2, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                No production data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Printing/Coating Stock Chart */}
                <Card className="industrial-card" data-testid="printing-stock-chart">
                    <CardHeader>
                        <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                            <Printer className="w-5 h-5 text-primary" />
                            Printing/Coating Bodies
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {printingChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={printingChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis type="number" stroke="#a1a1aa" fontSize={12} />
                                    <YAxis 
                                        type="category" 
                                        dataKey="name" 
                                        stroke="#a1a1aa" 
                                        fontSize={11}
                                        width={100}
                                    />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#18181b', 
                                            border: '1px solid #27272a',
                                            borderRadius: '2px'
                                        }}
                                        labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
                                    />
                                    <Bar dataKey="bodies" fill="#ea580c" radius={[0, 2, 2, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                No printing data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Overview Pie Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="industrial-card" data-testid="overview-pie-chart">
                    <CardHeader>
                        <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            Production Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#18181b', 
                                        border: '1px solid #27272a',
                                        borderRadius: '2px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-6 mt-4">
                            {pieData.map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-2">
                                    <div 
                                        className="w-3 h-3 rounded-sm" 
                                        style={{ backgroundColor: CHART_COLORS[index] }}
                                    />
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                        {entry.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card className="industrial-card lg:col-span-2" data-testid="quick-stats">
                    <CardHeader>
                        <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            Quick Stats
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-secondary/50 rounded-sm border border-border">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Sheets Used
                                </p>
                                <p className="font-display text-2xl font-bold mt-1">
                                    {formatNumber(stats?.printing_coating?.total_sheets_used || 0)}
                                </p>
                            </div>
                            <div className="p-4 bg-secondary/50 rounded-sm border border-border">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Pending Jobs
                                </p>
                                <p className="font-display text-2xl font-bold mt-1">
                                    {formatNumber(stats?.printing_coating?.pending_jobs || 0)}
                                </p>
                            </div>
                            <div className="p-4 bg-secondary/50 rounded-sm border border-border">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Produced
                                </p>
                                <p className="font-display text-2xl font-bold mt-1">
                                    {formatNumber(stats?.finished_goods?.total_produced || 0)}
                                </p>
                            </div>
                            <div className="p-4 bg-secondary/50 rounded-sm border border-border">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Dispatched
                                </p>
                                <p className="font-display text-2xl font-bold mt-1">
                                    {formatNumber(stats?.dispatch?.total_dispatched || 0)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
```


## Frontend - pages/Dispatch.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { dispatchAPI, brandsAPI, sizesAPI } from '../lib/api';
import { formatDate, formatNumber, getStatusColor } from '../lib/utils';
import { Plus, Trash2, Truck, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const Dispatch = () => {
    const [dispatches, setDispatches] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        order_number: '',
        customer_name: '',
        brand_id: '',
        size_id: '',
        quantity: '',
        delivery_address: '',
        notes: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dispatchRes, brandsRes, sizesRes] = await Promise.all([
                dispatchAPI.getAll(),
                brandsAPI.getAll(),
                sizesAPI.getAll()
            ]);
            setDispatches(dispatchRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
        } catch (err) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.order_number || !formData.customer_name || !formData.brand_id || 
            !formData.size_id || !formData.quantity) {
            toast.error('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            
            await dispatchAPI.create({
                order_number: formData.order_number,
                customer_name: formData.customer_name,
                brand_id: formData.brand_id,
                brand_name: brand?.name || '',
                size_id: formData.size_id,
                size_name: size?.name || '',
                quantity: parseInt(formData.quantity),
                delivery_address: formData.delivery_address || null,
                notes: formData.notes || null
            });
            toast.success('Dispatch order created successfully');
            setDialogOpen(false);
            resetForm();
            fetchData();
        } catch (err) {
            toast.error('Failed to create dispatch order');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            order_number: '',
            customer_name: '',
            brand_id: '',
            size_id: '',
            quantity: '',
            delivery_address: '',
            notes: ''
        });
    };

    const handleStatusChange = async (dispatchId, newStatus) => {
        try {
            await dispatchAPI.update(dispatchId, { status: newStatus });
            toast.success('Status updated');
            fetchData();
        } catch (err) {
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this dispatch?')) return;
        
        try {
            await dispatchAPI.delete(id);
            toast.success('Dispatch deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete dispatch');
        }
    };

    const totalQuantity = dispatches.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const pendingOrders = dispatches.filter(d => d.status === 'pending').length;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dispatch-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-muted-foreground">
                        Manage dispatch orders and shipments
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-dispatch-btn">
                            <Plus className="w-4 h-4 mr-2" />
                            New Dispatch
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border rounded-sm max-w-md">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Create Dispatch Order
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Order Number *
                                    </Label>
                                    <Input
                                        value={formData.order_number}
                                        onChange={(e) => setFormData({...formData, order_number: e.target.value})}
                                        placeholder="ORD-001"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="dispatch-order"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Customer *
                                    </Label>
                                    <Input
                                        value={formData.customer_name}
                                        onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                                        placeholder="Customer name"
                                        className="bg-background border-input rounded-sm"
                                        data-testid="dispatch-customer"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Brand *
                                </Label>
                                <Select 
                                    value={formData.brand_id} 
                                    onValueChange={(value) => setFormData({...formData, brand_id: value})}
                                >
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-brand">
                                        <SelectValue placeholder="Select brand" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                        {brands.map(brand => (
                                            <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Size *
                                    </Label>
                                    <Select 
                                        value={formData.size_id} 
                                        onValueChange={(value) => setFormData({...formData, size_id: value})}
                                    >
                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-size">
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border rounded-sm">
                                            {sizes.map(size => (
                                                <SelectItem key={size.id} value={size.id}>{size.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Quantity *
                                    </Label>
                                    <Input
                                        type="number"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                                        placeholder="0"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="dispatch-quantity"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Delivery Address
                                </Label>
                                <Textarea
                                    value={formData.delivery_address}
                                    onChange={(e) => setFormData({...formData, delivery_address: e.target.value})}
                                    placeholder="Enter delivery address..."
                                    className="bg-background border-input rounded-sm"
                                    data-testid="dispatch-address"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Notes
                                </Label>
                                <Input
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    placeholder="Optional notes..."
                                    className="bg-background border-input rounded-sm"
                                    data-testid="dispatch-notes"
                                />
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                disabled={submitting}
                                data-testid="submit-dispatch"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Dispatch'
                                )}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                                <Truck className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Orders
                                </p>
                                <p className="font-display text-2xl font-bold">{dispatches.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-warning/10 rounded-sm border border-warning/20">
                                <Truck className="w-5 h-5 text-warning" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Pending
                                </p>
                                <p className="font-display text-2xl font-bold">{pendingOrders}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-success/10 rounded-sm border border-success/20">
                                <Truck className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Quantity
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalQuantity)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                        Dispatch Orders
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : dispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>No dispatch orders found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="dispatch-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Order #</th>
                                        <th>Customer</th>
                                        <th>Brand</th>
                                        <th>Size</th>
                                        <th>Qty</th>
                                        <th>Status</th>
                                        <th>By</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dispatches.map((dispatch) => (
                                        <tr key={dispatch.id} data-testid={`dispatch-row-${dispatch.id}`}>
                                            <td>{formatDate(dispatch.dispatch_date)}</td>
                                            <td className="font-mono font-medium">{dispatch.order_number}</td>
                                            <td className="font-medium">{dispatch.customer_name}</td>
                                            <td>{dispatch.brand_name}</td>
                                            <td>
                                                <Badge variant="outline">{dispatch.size_name}</Badge>
                                            </td>
                                            <td className="font-mono">{formatNumber(dispatch.quantity)}</td>
                                            <td>
                                                <Select
                                                    value={dispatch.status}
                                                    onValueChange={(value) => handleStatusChange(dispatch.id, value)}
                                                >
                                                    <SelectTrigger className={`w-32 h-8 text-xs ${getStatusColor(dispatch.status)} rounded-sm`}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        <SelectItem value="pending">Pending</SelectItem>
                                                        <SelectItem value="dispatched">Dispatched</SelectItem>
                                                        <SelectItem value="delivered">Delivered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="text-muted-foreground">{dispatch.created_by}</td>
                                            <td>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(dispatch.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                    data-testid={`delete-dispatch-${dispatch.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Dispatch;
```


## Frontend - pages/Login.jsx
```javascript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Package, AlertCircle, Loader2 } from 'lucide-react';
import { seedAPI } from '../lib/api';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleSeedData = async () => {
        setSeeding(true);
        try {
            await seedAPI.seed();
            setError('');
            alert('Seed data created! Default admin: admin@crm.com / admin123');
        } catch (err) {
            setError('Failed to seed data');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div 
            className="min-h-screen flex items-center justify-center p-4 relative"
            style={{
                backgroundImage: `linear-gradient(to bottom, rgba(9, 9, 11, 0.85), rgba(9, 9, 11, 0.95)), url('https://images.unsplash.com/photo-1673095025656-233e3973075b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHw0fHxpbmR1c3RyaWFsJTIwcGFpbnQlMjBmYWN0b3J5JTIwaW50ZXJpb3IlMjBkYXJrJTIwbW9kZXxlbnwwfHx8fDE3NzM4MjM3ODJ8MA&ixlib=rb-4.1.0&q=85')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
            data-testid="login-page"
        >
            <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border rounded-sm">
                <CardHeader className="text-center space-y-4 pb-8">
                    <div className="flex justify-center">
                        <div className="p-4 bg-primary/10 rounded-sm border border-primary/20">
                            <Package className="w-12 h-12 text-primary" />
                        </div>
                    </div>
                    <div>
                        <CardTitle className="font-display text-3xl font-bold tracking-tight uppercase">
                            MFGCRM
                        </CardTitle>
                        <CardDescription className="text-xs tracking-widest uppercase mt-2">
                            Manufacturing Control System
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-sm text-destructive text-sm" data-testid="login-error">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@crm.com"
                                required
                                className="bg-background border-input rounded-sm font-mono"
                                data-testid="login-email"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="bg-background border-input rounded-sm font-mono"
                                data-testid="login-password"
                            />
                        </div>

                        <Button 
                            type="submit" 
                            className="w-full font-bold uppercase tracking-wider rounded-sm"
                            disabled={loading}
                            data-testid="login-submit"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Authenticating...
                                </>
                            ) : (
                                'Login'
                            )}
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground tracking-widest">
                                    First Time?
                                </span>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            className="w-full font-bold uppercase tracking-wider rounded-sm"
                            onClick={handleSeedData}
                            disabled={seeding}
                            data-testid="seed-data-btn"
                        >
                            {seeding ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating Data...
                                </>
                            ) : (
                                'Initialize System Data'
                            )}
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                            Click above to create default brands, sizes, and admin account
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default Login;
```


## Frontend - pages/Printing.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { printingAPI, brandsAPI, sizesAPI, purchaseAPI } from '../lib/api';
import { formatDate, formatNumber, getStatusColor } from '../lib/utils';
import { Plus, Trash2, Printer, Loader2, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';

const Printing = () => {
    const [jobs, setJobs] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [availableMaterials, setAvailableMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        job_number: '',
        raw_material_id: '',
        notes: ''
    });
    
    // Selected raw material info
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    
    // Job entries: each entry has size, brand, bodies
    const [jobEntries, setJobEntries] = useState([]);
    
    // Current entry being added
    const [currentSizeId, setCurrentSizeId] = useState('');
    const [currentBrandId, setCurrentBrandId] = useState('');
    const [currentBodiesCount, setCurrentBodiesCount] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [jobsRes, brandsRes, sizesRes, materialsRes] = await Promise.all([
                printingAPI.getAll(),
                brandsAPI.getAll(),
                sizesAPI.getAll(),
                purchaseAPI.getAvailable()
            ]);
            setJobs(jobsRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
            setAvailableMaterials(materialsRes.data);
        } catch (err) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleMaterialChange = (materialId) => {
        setFormData({...formData, raw_material_id: materialId});
        const material = availableMaterials.find(m => m.id === materialId);
        setSelectedMaterial(material);
    };

    const handleAddEntry = () => {
        if (!currentSizeId || !currentBrandId || !currentBodiesCount) {
            toast.error('Please select size, brand and enter bodies count');
            return;
        }
        
        const size = sizes.find(s => s.id === currentSizeId);
        const brand = brands.find(b => b.id === currentBrandId);
        if (!size || !brand) return;
        
        setJobEntries([...jobEntries, {
            size_id: size.id,
            size_name: size.name,
            brand_id: brand.id,
            brand_name: brand.name,
            bodies_count: parseInt(currentBodiesCount)
        }]);
        
        // Reset current entry
        setCurrentSizeId('');
        setCurrentBrandId('');
        setCurrentBodiesCount('');
    };

    const handleRemoveEntry = (index) => {
        setJobEntries(jobEntries.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.job_number || !formData.raw_material_id || jobEntries.length === 0) {
            toast.error('Please fill job number, select raw material, and add at least one entry');
            return;
        }

        // Group entries by size for API format
        const sizesMap = {};
        jobEntries.forEach(entry => {
            if (!sizesMap[entry.size_id]) {
                sizesMap[entry.size_id] = {
                    size_id: entry.size_id,
                    size_name: entry.size_name,
                    brands: []
                };
            }
            sizesMap[entry.size_id].brands.push({
                brand_id: entry.brand_id,
                brand_name: entry.brand_name,
                bodies_count: entry.bodies_count
            });
        });

        setSubmitting(true);
        try {
            await printingAPI.create({
                job_number: formData.job_number,
                raw_material_id: formData.raw_material_id,
                sizes: Object.values(sizesMap),
                notes: formData.notes || null
            });
            toast.success('Printing job created successfully');
            setDialogOpen(false);
            resetForm();
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create job');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({ job_number: '', raw_material_id: '', notes: '' });
        setSelectedMaterial(null);
        setJobEntries([]);
        setCurrentSizeId('');
        setCurrentBrandId('');
        setCurrentBodiesCount('');
    };

    const handleStatusChange = async (jobId, newStatus) => {
        try {
            await printingAPI.update(jobId, { status: newStatus });
            toast.success('Status updated');
            fetchData();
        } catch (err) {
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this job?')) return;
        try {
            await printingAPI.delete(id);
            toast.success('Job deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete job');
        }
    };

    const getTotalBodies = () => jobEntries.reduce((sum, e) => sum + e.bodies_count, 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="printing-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage printing and coating jobs linked to raw materials</p>
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-job-btn">
                            <Plus className="w-4 h-4 mr-2" /> New Job
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Create Printing Job</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Job Number *</Label>
                                    <Input value={formData.job_number} onChange={(e) => setFormData({...formData, job_number: e.target.value})} placeholder="JOB-001" className="bg-background border-input rounded-sm font-mono" data-testid="job-number" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Raw Material *</Label>
                                    <Select value={formData.raw_material_id} onValueChange={handleMaterialChange}>
                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="raw-material-select">
                                            <SelectValue placeholder="Select raw material" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border rounded-sm">
                                            {availableMaterials.length === 0 ? (
                                                <div className="p-2 text-sm text-muted-foreground">No available materials</div>
                                            ) : availableMaterials.map(m => (
                                                <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {selectedMaterial && (
                                <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 grid grid-cols-3 gap-4 text-sm">
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Size</p><p className="font-mono font-bold">{selectedMaterial.size1} x {selectedMaterial.size2}</p></div>
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Gauge</p><p className="font-mono">{selectedMaterial.gauge}</p></div>
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Available Sheets</p><p className="font-mono font-bold text-primary">{formatNumber(selectedMaterial.sheets_available)}</p></div>
                                </div>
                            )}

                            <div className="border-t border-border pt-4">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add Size, Brand & Bodies</Label>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                <Select value={currentSizeId} onValueChange={setCurrentSizeId}>
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="container-size">
                                        <SelectValue placeholder="Size" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">
                                        {sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={currentBrandId} onValueChange={setCurrentBrandId}>
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="brand-select">
                                        <SelectValue placeholder="Brand" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                        {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Input type="number" value={currentBodiesCount} onChange={(e) => setCurrentBodiesCount(e.target.value)} placeholder="Bodies" className="bg-background border-input rounded-sm font-mono" data-testid="bodies-count" />
                                <Button type="button" onClick={handleAddEntry} className="rounded-sm" data-testid="add-entry-btn">
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>

                            {jobEntries.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Added Entries ({jobEntries.length})</Label>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {jobEntries.map((entry, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{entry.size_name}</Badge>
                                                    <span className="text-sm">{entry.brand_name}</span>
                                                    <Badge variant="secondary" className="font-mono">{formatNumber(entry.bodies_count)} bodies</Badge>
                                                </div>
                                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveEntry(idx)}>
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-sm p-2 bg-success/10 rounded-sm border border-success/20">
                                        <span className="font-bold uppercase tracking-wider">Total Bodies</span>
                                        <span className="font-mono font-bold text-success">{formatNumber(getTotalBodies())}</span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                                <Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="job-notes" />
                            </div>

                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting || jobEntries.length === 0 || !formData.raw_material_id} data-testid="submit-job">
                                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Job'}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Printer className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Jobs</p><p className="font-display text-2xl font-bold">{jobs.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><Printer className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending Jobs</p><p className="font-display text-2xl font-bold">{jobs.filter(j => j.status === 'pending').length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Layers className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Bodies</p><p className="font-display text-2xl font-bold">{formatNumber(jobs.reduce((sum, j) => sum + j.total_bodies, 0))}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Printing Jobs</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : jobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No printing jobs found</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="jobs-table">
                                <thead><tr><th>Date</th><th>Job #</th><th>Raw Material</th><th>Material Size</th><th>Sheets</th><th>Sizes & Brands</th><th>Total Bodies</th><th>Status</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {jobs.map((job) => (
                                        <tr key={job.id} data-testid={`job-row-${job.id}`}>
                                            <td>{formatDate(job.job_date)}</td>
                                            <td className="font-medium">{job.job_number}</td>
                                            <td>{job.raw_material_sr_no}</td>
                                            <td>{job.raw_material_size}</td>
                                            <td className="font-mono">{formatNumber(job.sheets_from_material)}</td>
                                            <td><div className="flex flex-wrap gap-1 max-w-xs">{job.sizes?.map((s, i) => (<Badge key={i} variant="outline" className="text-xs">{s.size_name}: {s.brands?.map(b => b.brand_name).join(', ')}</Badge>))}</div></td>
                                            <td className="font-mono text-primary font-bold">{formatNumber(job.total_bodies)}</td>
                                            <td>
                                                <Select value={job.status} onValueChange={(v) => handleStatusChange(job.id, v)}>
                                                    <SelectTrigger className={`w-32 h-8 text-xs ${getStatusColor(job.status)} rounded-sm`}><SelectValue /></SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        <SelectItem value="pending">Pending</SelectItem>
                                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                                        <SelectItem value="completed">Completed</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="text-muted-foreground">{job.created_by}</td>
                                            <td><Button variant="ghost" size="icon" onClick={() => handleDelete(job.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-job-${job.id}`}><Trash2 className="w-4 h-4" /></Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Printing;
```


## Frontend - pages/Production.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { productionAPI, brandsAPI, sizesAPI, printingAPI } from '../lib/api';
import { formatDate, formatNumber } from '../lib/utils';
import { Plus, Trash2, Factory, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const Production = () => {
    const [production, setProduction] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [printingJobs, setPrintingJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        brand_id: '',
        size_id: '',
        quantity_produced: '',
        printing_job_id: '',
        notes: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [prodRes, brandsRes, sizesRes, jobsRes] = await Promise.all([
                productionAPI.getAll(),
                brandsAPI.getAll(),
                sizesAPI.getAll(),
                printingAPI.getAll()
            ]);
            setProduction(prodRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
            setPrintingJobs(jobsRes.data.filter(j => j.status === 'completed'));
        } catch (err) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.brand_id || !formData.size_id || !formData.quantity_produced) {
            toast.error('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            
            await productionAPI.create({
                brand_id: formData.brand_id,
                brand_name: brand?.name || '',
                size_id: formData.size_id,
                size_name: size?.name || '',
                quantity_produced: parseInt(formData.quantity_produced),
                printing_job_id: formData.printing_job_id || null,
                notes: formData.notes || null
            });
            toast.success('Production entry added successfully');
            setDialogOpen(false);
            resetForm();
            fetchData();
        } catch (err) {
            toast.error('Failed to add production entry');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            brand_id: '',
            size_id: '',
            quantity_produced: '',
            printing_job_id: '',
            notes: ''
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this entry?')) return;
        
        try {
            await productionAPI.delete(id);
            toast.success('Entry deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete entry');
        }
    };

    const totalProduced = production.reduce((sum, p) => sum + (p.quantity_produced || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="production-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-muted-foreground">
                        Record finished goods production
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-production-btn">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Production
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border rounded-sm max-w-md">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Add Production Entry
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Brand *
                                </Label>
                                <Select 
                                    value={formData.brand_id} 
                                    onValueChange={(value) => setFormData({...formData, brand_id: value})}
                                >
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-brand">
                                        <SelectValue placeholder="Select brand" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                        {brands.map(brand => (
                                            <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Size *
                                </Label>
                                <Select 
                                    value={formData.size_id} 
                                    onValueChange={(value) => setFormData({...formData, size_id: value})}
                                >
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-size">
                                        <SelectValue placeholder="Select size" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">
                                        {sizes.map(size => (
                                            <SelectItem key={size.id} value={size.id}>{size.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Quantity Produced *
                                </Label>
                                <Input
                                    type="number"
                                    value={formData.quantity_produced}
                                    onChange={(e) => setFormData({...formData, quantity_produced: e.target.value})}
                                    placeholder="0"
                                    className="bg-background border-input rounded-sm font-mono"
                                    data-testid="prod-quantity"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    From Printing Job (Optional)
                                </Label>
                                <Select 
                                    value={formData.printing_job_id} 
                                    onValueChange={(value) => setFormData({...formData, printing_job_id: value})}
                                >
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-job">
                                        <SelectValue placeholder="Select job (optional)" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                        <SelectItem value="">None</SelectItem>
                                        {printingJobs.map(job => (
                                            <SelectItem key={job.id} value={job.id}>
                                                {job.job_number} - {job.size_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Notes
                                </Label>
                                <Textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    placeholder="Optional notes..."
                                    className="bg-background border-input rounded-sm"
                                    data-testid="prod-notes"
                                />
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                disabled={submitting}
                                data-testid="submit-production"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    'Add Production'
                                )}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                                <Factory className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Entries
                                </p>
                                <p className="font-display text-2xl font-bold">{production.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-success/10 rounded-sm border border-success/20">
                                <Factory className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Produced
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalProduced)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                        Production Records
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : production.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>No production records found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="production-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Brand</th>
                                        <th>Size</th>
                                        <th>Quantity</th>
                                        <th>Job Ref</th>
                                        <th>Notes</th>
                                        <th>By</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {production.map((entry) => (
                                        <tr key={entry.id} data-testid={`prod-row-${entry.id}`}>
                                            <td>{formatDate(entry.production_date)}</td>
                                            <td className="font-medium">{entry.brand_name}</td>
                                            <td>{entry.size_name}</td>
                                            <td className="font-mono text-primary font-medium">
                                                {formatNumber(entry.quantity_produced)}
                                            </td>
                                            <td className="text-muted-foreground">
                                                {entry.printing_job_id ? 'Linked' : '-'}
                                            </td>
                                            <td className="max-w-xs truncate text-muted-foreground">
                                                {entry.notes || '-'}
                                            </td>
                                            <td className="text-muted-foreground">{entry.created_by}</td>
                                            <td>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(entry.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                    data-testid={`delete-prod-${entry.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Production;
```


## Frontend - pages/Purchase.jsx
```javascript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { purchaseAPI } from '../lib/api';
import { formatDate, formatNumber } from '../lib/utils';
import { Plus, Trash2, ShoppingCart, Loader2, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';

const Purchase = () => {
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        sr_no: '',
        gauge: '',
        size1: '',
        size2: '',
        temper: '',
        weight: '',
        supplier: '',
        invoice_number: ''
    });

    useEffect(() => {
        fetchPurchases();
    }, []);

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const res = await purchaseAPI.getAll();
            setPurchases(res.data);
        } catch (err) {
            toast.error('Failed to load purchases');
        } finally {
            setLoading(false);
        }
    };

    // Calculate No of Sheets preview
    const calculateSheets = () => {
        const gauge = parseFloat(formData.gauge) || 0;
        const size1 = parseFloat(formData.size1) || 0;
        const size2 = parseFloat(formData.size2) || 0;
        const weight = parseFloat(formData.weight) || 0;
        
        if (gauge > 0 && size1 > 0 && size2 > 0 && weight > 0) {
            const divisor = (gauge * size1 * size2 / 100000) * 0.785;
            return Math.floor(weight / divisor);
        }
        return 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.sr_no || !formData.gauge || !formData.size1 || !formData.size2 || !formData.temper || !formData.weight) {
            toast.error('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        try {
            await purchaseAPI.create({
                sr_no: formData.sr_no,
                gauge: parseFloat(formData.gauge),
                size1: parseFloat(formData.size1),
                size2: parseFloat(formData.size2),
                temper: formData.temper,
                weight: parseFloat(formData.weight),
                supplier: formData.supplier || null,
                invoice_number: formData.invoice_number || null
            });
            toast.success('Raw material entry added successfully');
            setDialogOpen(false);
            setFormData({
                sr_no: '',
                gauge: '',
                size1: '',
                size2: '',
                temper: '',
                weight: '',
                supplier: '',
                invoice_number: ''
            });
            fetchPurchases();
        } catch (err) {
            toast.error('Failed to add entry');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this entry?')) return;
        
        try {
            await purchaseAPI.delete(id);
            toast.success('Entry deleted');
            fetchPurchases();
        } catch (err) {
            toast.error('Failed to delete entry');
        }
    };

    const totalSheets = purchases.reduce((sum, p) => sum + (p.no_of_sheets || 0), 0);
    const totalWeight = purchases.reduce((sum, p) => sum + (p.weight || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="purchase-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-muted-foreground">
                        Manage raw material (metal sheets) purchases
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-purchase-btn">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Entry
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border rounded-sm max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Add Raw Material Entry
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Sr. No *
                                    </Label>
                                    <Input
                                        value={formData.sr_no}
                                        onChange={(e) => setFormData({...formData, sr_no: e.target.value})}
                                        placeholder="e.g., RM-001"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-sr-no"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Gauge *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.001"
                                        value={formData.gauge}
                                        onChange={(e) => setFormData({...formData, gauge: e.target.value})}
                                        placeholder="e.g., 0.22"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-gauge"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Size 1 *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.size1}
                                        onChange={(e) => setFormData({...formData, size1: e.target.value})}
                                        placeholder="e.g., 914"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-size1"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Size 2 *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.size2}
                                        onChange={(e) => setFormData({...formData, size2: e.target.value})}
                                        placeholder="e.g., 1219"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-size2"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Temper *
                                    </Label>
                                    <Input
                                        value={formData.temper}
                                        onChange={(e) => setFormData({...formData, temper: e.target.value})}
                                        placeholder="e.g., T4, T5, DR8"
                                        className="bg-background border-input rounded-sm"
                                        data-testid="purchase-temper"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Weight (kg) *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({...formData, weight: e.target.value})}
                                        placeholder="e.g., 5000"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-weight"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Supplier
                                    </Label>
                                    <Input
                                        value={formData.supplier}
                                        onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                                        placeholder="Supplier name"
                                        className="bg-background border-input rounded-sm"
                                        data-testid="purchase-supplier"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Invoice No.
                                    </Label>
                                    <Input
                                        value={formData.invoice_number}
                                        onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                                        placeholder="INV-001"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-invoice"
                                    />
                                </div>
                            </div>

                            {/* Auto-calculated sheets preview */}
                            <div className="p-4 bg-primary/10 rounded-sm border border-primary/20">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            No. of Sheets (Auto-Calculated)
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            = Weight ÷ (Gauge × Size1 × Size2 ÷ 100000 × 0.785)
                                        </p>
                                    </div>
                                    <p className="font-display text-3xl font-bold text-primary">
                                        {formatNumber(calculateSheets())}
                                    </p>
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                disabled={submitting}
                                data-testid="purchase-submit"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    'Add Entry'
                                )}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                                <ShoppingCart className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Entries
                                </p>
                                <p className="font-display text-2xl font-bold">{purchases.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-success/10 rounded-sm border border-success/20">
                                <Layers className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Sheets
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalSheets)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-info/10 rounded-sm border border-info/20">
                                <ShoppingCart className="w-5 h-5 text-info" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Weight
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalWeight)} kg</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                        Raw Material Inventory
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : purchases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>No raw material entries found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="purchase-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Sr. No</th>
                                        <th>Gauge</th>
                                        <th>Size 1</th>
                                        <th>Size 2</th>
                                        <th>Temper</th>
                                        <th>Weight</th>
                                        <th>Total Sheets</th>
                                        <th>Used</th>
                                        <th>Available</th>
                                        <th>Supplier</th>
                                        <th>By</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.map((purchase) => (
                                        <tr key={purchase.id} data-testid={`purchase-row-${purchase.id}`}>
                                            <td>{formatDate(purchase.purchase_date)}</td>
                                            <td className="font-medium">{purchase.sr_no}</td>
                                            <td>{purchase.gauge}</td>
                                            <td>{purchase.size1}</td>
                                            <td>{purchase.size2}</td>
                                            <td>{purchase.temper}</td>
                                            <td>{formatNumber(purchase.weight)} kg</td>
                                            <td className="font-mono">
                                                {formatNumber(purchase.no_of_sheets)}
                                            </td>
                                            <td className="text-warning font-mono">
                                                {formatNumber(purchase.sheets_used || 0)}
                                            </td>
                                            <td className="text-success font-bold font-mono">
                                                {formatNumber(purchase.sheets_available || (purchase.no_of_sheets - (purchase.sheets_used || 0)))}
                                            </td>
                                            <td>{purchase.supplier || '-'}</td>
                                            <td className="text-muted-foreground">{purchase.created_by}</td>
                                            <td>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(purchase.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                    data-testid={`delete-purchase-${purchase.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Purchase;
```


## Frontend - tailwind.config.js
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['IBM Plex Sans', 'sans-serif'],
                display: ['Barlow Condensed', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                chart: {
                    '1': 'hsl(var(--chart-1))',
                    '2': 'hsl(var(--chart-2))',
                    '3': 'hsl(var(--chart-3))',
                    '4': 'hsl(var(--chart-4))',
                    '5': 'hsl(var(--chart-5))'
                },
                success: 'hsl(var(--success))',
                warning: 'hsl(var(--warning))',
                danger: 'hsl(var(--danger))',
                info: 'hsl(var(--info))'
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' }
                },
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(10px)' },
                    to: { opacity: '1', transform: 'translateY(0)' }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'fade-in': 'fade-in 0.3s ease-out'
            }
        }
    },
    plugins: [require("tailwindcss-animate")],
};
```

