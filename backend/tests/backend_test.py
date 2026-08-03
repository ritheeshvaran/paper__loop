"""Paper & Loop backend regression tests."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "ritheeshvaran2007@gmail.com"
ADMIN_PASSWORD = "admin123"
DEMO_EMAIL = "demo@paperandloop.com"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── Health / Public ──────────────────────────────────────────────────────
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "alive"

    def test_settings(self, session):
        r = session.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        for k in ("gpay_qr_url", "upi_id", "announcement", "hero_images"):
            assert k in data

    def test_categories(self, session):
        r = session.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) >= 8
        slugs = {c["slug"] for c in cats}
        assert {"anime", "cars", "keychains"}.issubset(slugs)

    def test_products_seeded(self, session):
        r = session.get(f"{API}/products")
        assert r.status_code == 200
        products = r.json()
        assert len(products) == 11
        slugs = {p["slug"] for p in products}
        assert "spider-man-iron-spider" in slugs
        assert "sweet-bear-unicorn-keychain" in slugs
        for prod in products:
            assert prod["images"], f"{prod['slug']} missing images"
            assert prod["images"][0].startswith("/uploads/") or prod["images"][0].startswith("https://"), prod["images"][0]


def _otp_code_from_send_response(data: dict) -> str:
    """Extract OTP code from send-otp response (dev_code in development)."""
    code = data.get("dev_code")
    assert code, f"dev_code missing from send-otp response: {data}"
    return code


def _register_via_otp(session, email, password="pass1234", name="Test User"):
    r = session.post(f"{API}/auth/send-otp", json={"email": email, "purpose": "registration"})
    assert r.status_code == 200, r.text
    code = _otp_code_from_send_response(r.json())
    r2 = session.post(f"{API}/auth/verify-otp", json={"email": email, "code": code, "purpose": "registration"})
    assert r2.status_code == 200, r2.text
    otp_token = r2.json()["otp_token"]
    payload = {
        "email": email, "password": password, "name": name,
        "phone": "9999999999", "address_line1": "1 Test St",
        "city": "Chennai", "state": "TN", "pincode": "600001",
        "otp_token": otp_token,
    }
    return session.post(f"{API}/auth/register", json=payload)


# ─── Auth ─────────────────────────────────────────────────────────────────
class TestAuth:
    def test_register_new(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = _register_via_otp(session, email)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and d["user"]["email"] == email
        assert d["user"]["role"] == "customer"
        assert d["user"]["email_verified"] is True

    def test_login_wrong_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401

    def test_login_unknown_email(self, session):
        r = session.post(f"{API}/auth/login", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@x.com", "password": "abc12345"})
        assert r.status_code == 401

    def test_login_demo(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "customer"

    def test_me_and_update(self, session, customer_token):
        r = session.get(f"{API}/auth/me", headers=auth(customer_token))
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL
        r2 = session.put(f"{API}/auth/me", headers=auth(customer_token), json={"phone": "8888888888"})
        assert r2.status_code == 200
        assert r2.json()["phone"] == "8888888888"

    def test_admin_login(self, session, admin_token):
        r = session.get(f"{API}/auth/me", headers=auth(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ─── Admin auth guards ────────────────────────────────────────────────────
class TestAdminGuards:
    def test_analytics_requires_admin(self, session):
        r = session.get(f"{API}/admin/analytics")
        assert r.status_code == 401

    def test_analytics_non_admin_forbidden(self, session, customer_token):
        r = session.get(f"{API}/admin/analytics", headers=auth(customer_token))
        assert r.status_code == 403

    def test_analytics_admin_ok(self, session, admin_token):
        r = session.get(f"{API}/admin/analytics", headers=auth(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "product_count" in d and "customer_count" in d


# ─── Product filters ──────────────────────────────────────────────────────
class TestProducts:
    def test_filter_category_anime(self, session):
        r = session.get(f"{API}/products", params={"category": "anime"})
        assert r.status_code == 200
        assert all(p["category_slug"] == "anime" for p in r.json())

    def test_filter_best_seller(self, session):
        r = session.get(f"{API}/products", params={"best_seller": "true"})
        assert r.status_code == 200
        assert all(p.get("is_best_seller") for p in r.json())

    def test_filter_trending(self, session):
        r = session.get(f"{API}/products", params={"trending": "true"})
        assert r.status_code == 200
        assert all(p.get("is_trending") for p in r.json())

    def test_filter_featured(self, session):
        r = session.get(f"{API}/products", params={"featured": "true"})
        assert r.status_code == 200
        assert all(p.get("is_featured") for p in r.json())

    def test_search_q(self, session):
        r = session.get(f"{API}/products", params={"q": "spider"})
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_sort_price_asc(self, session):
        r = session.get(f"{API}/products", params={"sort": "price_asc"})
        prices = [p["price"] for p in r.json()]
        assert prices == sorted(prices)

    def test_sort_price_desc(self, session):
        r = session.get(f"{API}/products", params={"sort": "price_desc"})
        prices = [p["price"] for p in r.json()]
        assert prices == sorted(prices, reverse=True)

    def test_get_by_slug_computed(self, session):
        # Iteration 4: verify final_price computation on one of the seeded posters
        r = session.get(f"{API}/products/spider-man-iron-spider")
        assert r.status_code == 200
        p = r.json()
        expected = round(p["price"] * (1 - p.get("discount_percent", 0) / 100), 2)
        assert p["final_price"] == expected
        assert p["has_discount"] == (p.get("discount_percent", 0) > 0)


# ─── Cart flow ────────────────────────────────────────────────────────────
class TestCart:
    def test_cart_full_flow(self, session, customer_token):
        # Clear existing cart first
        cart = session.get(f"{API}/cart", headers=auth(customer_token)).json()
        for it in cart.get("items", []):
            session.delete(f"{API}/cart/{it['product_id']}", headers=auth(customer_token))

        # get products list -> pick one
        products = session.get(f"{API}/products", params={"category": "anime"}).json()
        pid = products[0]["id"]

        # empty cart
        r0 = session.get(f"{API}/cart", headers=auth(customer_token))
        assert r0.status_code == 200
        assert r0.json()["items"] == []

        # add
        r1 = session.post(f"{API}/cart", headers=auth(customer_token), json={"product_id": pid, "quantity": 2})
        assert r1.status_code == 200
        assert r1.json()["items"][0]["quantity"] == 2

        # update
        r2 = session.put(f"{API}/cart/{pid}", headers=auth(customer_token), json={"product_id": pid, "quantity": 3})
        assert r2.status_code == 200
        assert r2.json()["items"][0]["quantity"] == 3
        d = r2.json()
        assert d["total"] == round(d["subtotal"] - d["discount_total"], 2)

        # remove
        r3 = session.delete(f"{API}/cart/{pid}", headers=auth(customer_token))
        assert r3.status_code == 200
        assert r3.json()["items"] == []


# ─── Wishlist ─────────────────────────────────────────────────────────────
class TestWishlist:
    def test_toggle(self, session, customer_token):
        p = session.get(f"{API}/products").json()[0]
        pid = p["id"]
        r1 = session.post(f"{API}/wishlist/{pid}", headers=auth(customer_token))
        assert r1.status_code == 200
        w1 = r1.json()["wishlisted"]
        r2 = session.post(f"{API}/wishlist/{pid}", headers=auth(customer_token))
        assert r2.json()["wishlisted"] != w1
        # ensure clean state - add back if we removed, then get list
        if not r2.json()["wishlisted"]:
            session.post(f"{API}/wishlist/{pid}", headers=auth(customer_token))
        r3 = session.get(f"{API}/wishlist", headers=auth(customer_token))
        assert r3.status_code == 200
        assert any(x["id"] == pid for x in r3.json())
        # cleanup
        session.post(f"{API}/wishlist/{pid}", headers=auth(customer_token))


# ─── Checkout, payment, order lifecycle ───────────────────────────────────
@pytest.fixture(scope="module")
def new_customer(session):
    email = f"buyer_{uuid.uuid4().hex[:8]}@example.com"
    r = _register_via_otp(session, email, name="Buyer One")
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


class TestOrderLifecycle:
    def test_full_flow(self, session, new_customer, admin_token):
        token, user = new_customer
        products = session.get(f"{API}/products").json()
        p = products[0]

        # add to cart
        r = session.post(f"{API}/cart", headers=auth(token), json={"product_id": p["id"], "quantity": 2})
        assert r.status_code == 200

        # checkout
        r = session.post(f"{API}/orders/checkout", headers=auth(token), json={
            "address_line1": "1 Buyer St", "city": "Chennai", "state": "TN",
            "pincode": "600001", "phone": "9999999999", "order_note": "please",
        })
        assert r.status_code == 200
        order = r.json()
        assert order["status"] == "placed"
        assert order["order_number"].startswith("PL-")
        assert len(order["items"]) == 1
        oid = order["id"]

        # cart cleared
        cart = session.get(f"{API}/cart", headers=auth(token)).json()
        assert cart["items"] == []

        # submit payment
        r = session.post(f"{API}/orders/{oid}/submit-payment", headers=auth(token), json={"transaction_id": "TXN123456"})
        assert r.status_code == 200
        assert r.json()["status"] == "payment_under_validation"
        assert r.json()["payment_status"] == "under_validation"

        # list orders
        r = session.get(f"{API}/orders", headers=auth(token))
        assert r.status_code == 200
        assert any(o["id"] == oid for o in r.json())

        # admin advance to approved
        r = session.put(f"{API}/admin/orders/{oid}/status", headers=auth(admin_token), json={"status": "approved"})
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        assert r.json()["payment_status"] == "verified"

        # cannot move backward
        r = session.put(f"{API}/admin/orders/{oid}/status", headers=auth(admin_token), json={"status": "placed"})
        assert r.status_code == 400

        # forward through preparing/packed/out_for_delivery
        for status in ["preparing", "packed", "out_for_delivery", "delivered"]:
            r = session.put(f"{API}/admin/orders/{oid}/status", headers=auth(admin_token), json={"status": status})
            assert r.status_code == 200, f"{status}: {r.text}"
            assert r.json()["status"] == status

        # delivered → cancel should fail
        r = session.post(f"{API}/orders/{oid}/cancel", headers=auth(token))
        assert r.status_code == 400

        # delivery date set
        r = session.put(f"{API}/admin/orders/{oid}/delivery-date", headers=auth(admin_token),
                        json={"delivery_date": "2026-02-01T00:00:00Z"})
        assert r.status_code == 200
        assert r.json()["delivery_date"] == "2026-02-01T00:00:00Z"

    def test_cancel_flow(self, session, admin_token):
        # Fresh order to test cancel
        email = f"cancel_{uuid.uuid4().hex[:8]}@example.com"
        reg = _register_via_otp(session, email, name="C").json()
        token = reg["token"]
        p = session.get(f"{API}/products").json()[0]
        session.post(f"{API}/cart", headers=auth(token), json={"product_id": p["id"], "quantity": 1})
        order = session.post(f"{API}/orders/checkout", headers=auth(token), json={
            "address_line1": "x", "city": "c", "state": "s", "pincode": "1", "phone": "1",
        }).json()
        oid = order["id"]
        # Check stock decremented
        p2 = session.get(f"{API}/products/{p['slug']}").json()
        # Cancel
        r = session.post(f"{API}/orders/{oid}/cancel", headers=auth(token))
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        # stock restored
        p3 = session.get(f"{API}/products/{p['slug']}").json()
        assert p3["stock_quantity"] == p2["stock_quantity"] + 1


# ─── Admin CRUD ───────────────────────────────────────────────────────────
class TestAdminCRUD:
    def test_product_crud(self, session, admin_token):
        payload = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "category_slug": "anime", "price": 500, "discount_percent": 10,
            "description": "test", "images": ["https://x/img.jpg"], "stock_quantity": 5,
        }
        r = session.post(f"{API}/admin/products", headers=auth(admin_token), json=payload)
        assert r.status_code == 200, r.text
        prod = r.json()
        pid = prod["id"]
        assert prod["final_price"] == round(500 * 0.9, 2)

        # update
        r2 = session.put(f"{API}/admin/products/{pid}", headers=auth(admin_token),
                         json={**payload, "price": 600})
        assert r2.status_code == 200
        assert r2.json()["price"] == 600

        # delete
        r3 = session.delete(f"{API}/admin/products/{pid}", headers=auth(admin_token))
        assert r3.status_code == 200

    def test_settings_update(self, session, admin_token):
        original = session.get(f"{API}/settings").json()
        new_text = f"TEST announcement {uuid.uuid4().hex[:6]}"
        r = session.put(f"{API}/admin/settings", headers=auth(admin_token),
                        json={"announcement": new_text})
        assert r.status_code == 200
        assert r.json()["announcement"] == new_text
        # revert
        session.put(f"{API}/admin/settings", headers=auth(admin_token),
                    json={"announcement": original["announcement"]})

    def test_category_create(self, session, admin_token):
        name = f"TEST_Cat_{uuid.uuid4().hex[:5]}"
        r = session.post(f"{API}/admin/categories", headers=auth(admin_token),
                         json={"name": name, "sort_order": 99})
        assert r.status_code == 200
        cat_id = r.json()["id"]
        # cleanup
        session.delete(f"{API}/admin/categories/{cat_id}", headers=auth(admin_token))
