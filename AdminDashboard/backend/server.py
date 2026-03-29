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
    printing_stock_used: int = 0
    printing_job_id: Optional[str] = None
    notes: Optional[str] = None

class ProductionEntryResponse(BaseModel):
    id: str
    brand_id: str
    brand_name: str
    size_id: str
    size_name: str
    quantity_produced: int
    printing_stock_used: int = 0
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
        "printing_stock_used": prod_data.printing_stock_used,
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
    for e in entries:
        if "printing_stock_used" not in e:
            e["printing_stock_used"] = 0
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
    # Printing/Coating Stock
    printing_jobs = await db.printing_jobs.find({}, {"_id": 0}).to_list(1000)
    pending_jobs = sum(1 for j in printing_jobs if j.get("status") == "pending")
    completed_jobs = sum(1 for j in printing_jobs if j.get("status") == "completed")
    
    # Calculate total printing stock (bodies * sheets)
    total_printing_stock = 0
    for job in printing_jobs:
        sheets = job.get("sheets_from_material", 0)
        total_bodies = job.get("total_bodies", 0)
        total_printing_stock += (total_bodies * sheets)
    
    # Finished Goods (total produced)
    production = await db.production.find({}, {"_id": 0}).to_list(1000)
    total_finished_goods = sum(p.get("quantity_produced", 0) for p in production)
    
    # Total printing used in production
    total_printing_used = sum(p.get("printing_stock_used", 0) for p in production)
    
    # Dispatch Stats
    dispatches = await db.dispatch.find({}, {"_id": 0}).to_list(1000)
    total_dispatched = sum(d.get("quantity", 0) for d in dispatches if d.get("status") in ["dispatched", "delivered"])
    pending_orders = sum(1 for d in dispatches if d.get("status") == "pending")
    
    # Purchase Stats
    purchases = await db.purchases.find({}, {"_id": 0}).to_list(1000)
    total_sheets = sum(p.get("no_of_sheets", 0) for p in purchases)
    total_sheets_available = sum(p.get("no_of_sheets", 0) - p.get("sheets_used", 0) for p in purchases)
    total_weight = sum(p.get("weight", 0) for p in purchases)
    
    return {
        "printing_coating": {
            "total_printing_stock": total_printing_stock,
            "printing_stock_available": total_printing_stock - total_printing_used,
            "pending_jobs": pending_jobs,
            "completed_jobs": completed_jobs
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

@api_router.get("/dashboard/purchase-stock")
async def get_purchase_stock(user: dict = Depends(get_current_user)):
    """Get raw material stock by size"""
    purchases = await db.purchases.find({}, {"_id": 0}).to_list(1000)
    
    stock_map = {}
    for p in purchases:
        size_key = f"{p['size1']}x{p['size2']}"
        if size_key not in stock_map:
            stock_map[size_key] = {
                "size": size_key,
                "gauge": p.get("gauge", 0),
                "total_sheets": 0,
                "sheets_used": 0,
                "sheets_available": 0,
                "total_weight": 0
            }
        stock_map[size_key]["total_sheets"] += p.get("no_of_sheets", 0)
        stock_map[size_key]["sheets_used"] += p.get("sheets_used", 0)
        stock_map[size_key]["sheets_available"] += (p.get("no_of_sheets", 0) - p.get("sheets_used", 0))
        stock_map[size_key]["total_weight"] += p.get("weight", 0)
    
    return list(stock_map.values())

@api_router.get("/dashboard/printing-stock-list")
async def get_printing_stock_list(user: dict = Depends(get_current_user)):
    """Get printing stock by size and brand (Printing Done - Production Usage)"""
    jobs = await db.printing_jobs.find({}, {"_id": 0}).to_list(1000)
    production = await db.production.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate printing done (bodies * sheets) by size and brand
    stock_map = {}
    for job in jobs:
        sheets = job.get("sheets_from_material", 0)
        sizes = job.get("sizes", [])
        
        for size_entry in sizes:
            size_name = size_entry.get("size_name", "Unknown")
            for brand in size_entry.get("brands", []):
                key = f"{size_name}_{brand['brand_name']}"
                if key not in stock_map:
                    stock_map[key] = {
                        "size_name": size_name,
                        "brand_name": brand["brand_name"],
                        "printing_done": 0,
                        "used_in_production": 0,
                        "available": 0
                    }
                # Printing stock = bodies * sheets
                stock_map[key]["printing_done"] += (brand.get("bodies_count", 0) * sheets)
    
    # Subtract production usage
    for p in production:
        key = f"{p.get('size_name', '')}_{p.get('brand_name', '')}"
        if key in stock_map:
            stock_map[key]["used_in_production"] += p.get("printing_stock_used", 0)
    
    # Calculate available
    for key in stock_map:
        stock_map[key]["available"] = stock_map[key]["printing_done"] - stock_map[key]["used_in_production"]
    
    return list(stock_map.values())

@api_router.get("/dashboard/finished-goods-list")
async def get_finished_goods_list(user: dict = Depends(get_current_user)):
    """Get finished goods stock by size and brand"""
    production = await db.production.find({}, {"_id": 0}).to_list(1000)
    dispatches = await db.dispatch.find({}, {"_id": 0}).to_list(1000)
    
    stock_map = {}
    
    # Add production
    for p in production:
        key = f"{p.get('size_name', '')}_{p.get('brand_name', '')}"
        if key not in stock_map:
            stock_map[key] = {
                "size_name": p.get("size_name", ""),
                "brand_name": p.get("brand_name", ""),
                "produced": 0,
                "dispatched": 0,
                "available": 0
            }
        stock_map[key]["produced"] += p.get("quantity_produced", 0)
    
    # Subtract dispatched
    for d in dispatches:
        if d.get("status") in ["dispatched", "delivered"]:
            key = f"{d.get('size_name', '')}_{d.get('brand_name', '')}"
            if key in stock_map:
                stock_map[key]["dispatched"] += d.get("quantity", 0)
    
    # Calculate available
    for key in stock_map:
        stock_map[key]["available"] = stock_map[key]["produced"] - stock_map[key]["dispatched"]
    
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
