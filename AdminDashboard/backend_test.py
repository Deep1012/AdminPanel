import requests
import json
import sys
from datetime import datetime

class CRMAPITester:
    def __init__(self, base_url="https://print-coat-track.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_user = {
            "email": "admin@crm.com",
            "password": "admin123"
        }
        
    def log_test(self, name, success, details=""):
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED {details}")
        else:
            print(f"❌ {name}: FAILED {details}")
        return success

    def test_health_check(self):
        """Test basic API health"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=10)
            return self.log_test("Health Check", 
                               response.status_code == 200, 
                               f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Health Check", False, f"Error: {str(e)}")

    def test_seed_data(self):
        """Test seed data creation"""
        try:
            response = requests.post(f"{self.api_url}/seed", timeout=30)
            success = response.status_code == 200
            if success:
                data = response.json()
                brands_created = data.get('brands_created', 0)
                sizes_created = data.get('sizes_created', 0)
                details = f"Brands: {brands_created}, Sizes: {sizes_created}"
            else:
                details = f"Status: {response.status_code}"
            return self.log_test("Seed Data Creation", success, details)
        except Exception as e:
            return self.log_test("Seed Data Creation", False, f"Error: {str(e)}")

    def test_login(self):
        """Test admin login"""
        try:
            response = requests.post(
                f"{self.api_url}/auth/login",
                json=self.admin_user,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            success = response.status_code == 200
            if success:
                data = response.json()
                self.token = data.get('token')
                user_data = data.get('user', {})
                details = f"User: {user_data.get('username')}, Role: {user_data.get('role')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            return self.log_test("Admin Login", success, details)
        except Exception as e:
            return self.log_test("Admin Login", False, f"Error: {str(e)}")

    def get_auth_headers(self):
        """Get headers with authorization token"""
        if not self.token:
            return {'Content-Type': 'application/json'}
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.token}'
        }

    def test_get_brands(self):
        """Test getting brands list"""
        try:
            response = requests.get(
                f"{self.api_url}/brands",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                brands = response.json()
                details = f"Found {len(brands)} brands"
                # Check if we have expected brands
                brand_names = [b.get('name', '') for b in brands]
                if 'SYNCOAT' in brand_names and 'AUTOCOAT' in brand_names:
                    details += " (includes expected brands)"
            else:
                details = f"Status: {response.status_code}"
            return self.log_test("Get Brands", success, details)
        except Exception as e:
            return self.log_test("Get Brands", False, f"Error: {str(e)}")

    def test_get_sizes(self):
        """Test getting sizes list"""
        try:
            response = requests.get(
                f"{self.api_url}/sizes",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                sizes = response.json()
                details = f"Found {len(sizes)} sizes"
                # Check if we have expected sizes
                size_names = [s.get('name', '') for s in sizes]
                if '4LTR/5KG' in size_names and '1LTR' in size_names:
                    details += " (includes expected sizes)"
            else:
                details = f"Status: {response.status_code}"
            return self.log_test("Get Sizes", success, details)
        except Exception as e:
            return self.log_test("Get Sizes", False, f"Error: {str(e)}")

    def test_create_purchase(self):
        """Test creating a purchase"""
        try:
            purchase_data = {
                "material_name": "Test Paint Thinner",
                "quantity": 100.5,
                "unit": "LTR",
                "rate": 50.0,
                "supplier": "Test Supplier Ltd",
                "invoice_number": "INV-TEST-001"
            }
            response = requests.post(
                f"{self.api_url}/purchases",
                json=purchase_data,
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                data = response.json()
                details = f"Purchase ID: {data.get('id')}, Total: {data.get('total_amount')}"
                self.test_purchase_id = data.get('id')  # Store for later tests
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            return self.log_test("Create Purchase", success, details)
        except Exception as e:
            return self.log_test("Create Purchase", False, f"Error: {str(e)}")

    def test_get_purchases(self):
        """Test getting purchases list"""
        try:
            response = requests.get(
                f"{self.api_url}/purchases",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                purchases = response.json()
                details = f"Found {len(purchases)} purchases"
            else:
                details = f"Status: {response.status_code}"
            return self.log_test("Get Purchases", success, details)
        except Exception as e:
            return self.log_test("Get Purchases", False, f"Error: {str(e)}")

    def test_create_printing_job(self):
        """Test creating a printing job"""
        try:
            # First get brands and sizes
            brands_response = requests.get(f"{self.api_url}/brands", headers=self.get_auth_headers())
            sizes_response = requests.get(f"{self.api_url}/sizes", headers=self.get_auth_headers())
            
            if brands_response.status_code == 200 and sizes_response.status_code == 200:
                brands = brands_response.json()
                sizes = sizes_response.json()
                
                if len(brands) > 0 and len(sizes) > 0:
                    brand = brands[0]
                    size = sizes[0]
                    
                    job_data = {
                        "job_number": f"JOB-TEST-{datetime.now().strftime('%H%M%S')}",
                        "size_id": size['id'],
                        "size_name": size['name'],
                        "brands": [
                            {
                                "brand_id": brand['id'],
                                "brand_name": brand['name'],
                                "bodies_count": 100
                            }
                        ],
                        "raw_material_used": 25.5,
                        "notes": "Test printing job"
                    }
                    
                    response = requests.post(
                        f"{self.api_url}/printing-jobs",
                        json=job_data,
                        headers=self.get_auth_headers(),
                        timeout=10
                    )
                    success = response.status_code == 200
                    if success:
                        data = response.json()
                        details = f"Job ID: {data.get('id')}, Bodies: {data.get('total_bodies')}"
                        self.test_job_id = data.get('id')  # Store for later tests
                    else:
                        details = f"Status: {response.status_code}, Response: {response.text[:100]}"
                else:
                    success = False
                    details = "No brands or sizes available"
            else:
                success = False
                details = "Failed to fetch brands/sizes"
                
            return self.log_test("Create Printing Job", success, details)
        except Exception as e:
            return self.log_test("Create Printing Job", False, f"Error: {str(e)}")

    def test_create_production(self):
        """Test creating production entry"""
        try:
            # First get brands and sizes
            brands_response = requests.get(f"{self.api_url}/brands", headers=self.get_auth_headers())
            sizes_response = requests.get(f"{self.api_url}/sizes", headers=self.get_auth_headers())
            
            if brands_response.status_code == 200 and sizes_response.status_code == 200:
                brands = brands_response.json()
                sizes = sizes_response.json()
                
                if len(brands) > 0 and len(sizes) > 0:
                    brand = brands[0]
                    size = sizes[0]
                    
                    prod_data = {
                        "brand_id": brand['id'],
                        "brand_name": brand['name'],
                        "size_id": size['id'],
                        "size_name": size['name'],
                        "quantity_produced": 75,
                        "notes": "Test production entry"
                    }
                    
                    response = requests.post(
                        f"{self.api_url}/production",
                        json=prod_data,
                        headers=self.get_auth_headers(),
                        timeout=10
                    )
                    success = response.status_code == 200
                    if success:
                        data = response.json()
                        details = f"Production ID: {data.get('id')}, Quantity: {data.get('quantity_produced')}"
                        self.test_prod_id = data.get('id')  # Store for later tests
                    else:
                        details = f"Status: {response.status_code}, Response: {response.text[:100]}"
                else:
                    success = False
                    details = "No brands or sizes available"
            else:
                success = False
                details = "Failed to fetch brands/sizes"
                
            return self.log_test("Create Production", success, details)
        except Exception as e:
            return self.log_test("Create Production", False, f"Error: {str(e)}")

    def test_create_dispatch(self):
        """Test creating dispatch order"""
        try:
            # First get brands and sizes
            brands_response = requests.get(f"{self.api_url}/brands", headers=self.get_auth_headers())
            sizes_response = requests.get(f"{self.api_url}/sizes", headers=self.get_auth_headers())
            
            if brands_response.status_code == 200 and sizes_response.status_code == 200:
                brands = brands_response.json()
                sizes = sizes_response.json()
                
                if len(brands) > 0 and len(sizes) > 0:
                    brand = brands[0]
                    size = sizes[0]
                    
                    dispatch_data = {
                        "order_number": f"ORD-TEST-{datetime.now().strftime('%H%M%S')}",
                        "customer_name": "Test Customer Ltd",
                        "brand_id": brand['id'],
                        "brand_name": brand['name'],
                        "size_id": size['id'],
                        "size_name": size['name'],
                        "quantity": 50,
                        "delivery_address": "123 Test Street, Test City",
                        "notes": "Test dispatch order"
                    }
                    
                    response = requests.post(
                        f"{self.api_url}/dispatch",
                        json=dispatch_data,
                        headers=self.get_auth_headers(),
                        timeout=10
                    )
                    success = response.status_code == 200
                    if success:
                        data = response.json()
                        details = f"Dispatch ID: {data.get('id')}, Quantity: {data.get('quantity')}"
                        self.test_dispatch_id = data.get('id')  # Store for later tests
                    else:
                        details = f"Status: {response.status_code}, Response: {response.text[:100]}"
                else:
                    success = False
                    details = "No brands or sizes available"
            else:
                success = False
                details = "Failed to fetch brands/sizes"
                
            return self.log_test("Create Dispatch", success, details)
        except Exception as e:
            return self.log_test("Create Dispatch", False, f"Error: {str(e)}")

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        try:
            response = requests.get(
                f"{self.api_url}/dashboard/stats",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                stats = response.json()
                printing_data = stats.get('printing_coating', {})
                finished_data = stats.get('finished_goods', {})
                details = f"Total bodies: {printing_data.get('total_bodies', 0)}, Finished goods: {finished_data.get('total_produced', 0)}"
            else:
                details = f"Status: {response.status_code}"
            return self.log_test("Dashboard Stats", success, details)
        except Exception as e:
            return self.log_test("Dashboard Stats", False, f"Error: {str(e)}")

    def test_users_management(self):
        """Test user management endpoints"""
        try:
            response = requests.get(
                f"{self.api_url}/users",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                users = response.json()
                details = f"Found {len(users)} users"
                # Check if admin user exists
                admin_users = [u for u in users if u.get('role') == 'admin']
                if admin_users:
                    details += f", {len(admin_users)} admin(s)"
            else:
                details = f"Status: {response.status_code}"
            return self.log_test("Users Management", success, details)
        except Exception as e:
            return self.log_test("Users Management", False, f"Error: {str(e)}")

    def run_all_tests(self):
        """Run comprehensive API test suite"""
        print("🔬 Starting Manufacturing CRM API Test Suite")
        print(f"📍 Testing endpoint: {self.base_url}")
        print("=" * 60)
        
        # Core tests
        self.test_health_check()
        self.test_seed_data()
        self.test_login()
        
        if not self.token:
            print("\n❌ Cannot proceed without authentication token")
            return False
        
        # Data structure tests
        self.test_get_brands()
        self.test_get_sizes()
        self.test_users_management()
        
        # CRUD operation tests
        self.test_create_purchase()
        self.test_get_purchases()
        self.test_create_printing_job()
        self.test_create_production()
        self.test_create_dispatch()
        
        # Analytics tests
        self.test_dashboard_stats()
        
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        print(f"✅ Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = CRMAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())