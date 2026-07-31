"""Iteration 2 backend tests: OTP registration/password-reset, newsletter, restock, testimonials, gallery, discounts, activity, analytics, upload."""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "ritheeshvaran2007@gmail.com"
ADMIN_PASSWORD = "admin123"
DEMO_EMAIL = "demo@paperandloop.com"
DEMO_PASSWORD = "demo1234"


def _auth(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return r.json()["token"]


# ─── OTP Registration Flow ───────────────────────────────────────────────
class TestOtpRegistration:
    def test_send_otp_new_user_returns_dev_code(self, s):
        email = f"otpreg_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/send-otp", json={"email": email, "purpose": "registration"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sent"] is True
        assert d.get("delivery") in ("sent", "unconfigured", "error")
        assert "dev_code" in d, f"dev_code missing in development: {d}"
        assert len(d["dev_code"]) == 6
        # save for later
        pytest.otp_email = email
        pytest.otp_code = d["dev_code"]

    def test_send_otp_existing_email_anti_enumeration(self, s):
        # Existing emails must not reveal account status
        r = s.post(f"{API}/auth/send-otp", json={"email": DEMO_EMAIL, "purpose": "registration"})
        assert r.status_code == 200
        assert r.json().get("sent") is True
        assert "dev_code" not in r.json()

    def test_verify_wrong_code_400(self, s):
        email = f"otpwrong_{uuid.uuid4().hex[:8]}@test.com"
        s.post(f"{API}/auth/send-otp", json={"email": email, "purpose": "registration"})
        r = s.post(f"{API}/auth/verify-otp", json={"email": email, "code": "000000", "purpose": "registration"})
        assert r.status_code == 400

    def test_verify_correct_code_returns_token(self, s):
        r = s.post(f"{API}/auth/verify-otp", json={
            "email": pytest.otp_email, "code": pytest.otp_code, "purpose": "registration"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["verified"] is True
        assert "otp_token" in d and len(d["otp_token"]) > 20
        pytest.otp_token = d["otp_token"]

    def test_register_with_otp_token(self, s):
        r = s.post(f"{API}/auth/register", json={
            "email": pytest.otp_email, "password": "Pass1234", "name": "OTP User",
            "phone": "9999999999", "address_line1": "1 St", "city": "Chennai",
            "state": "TN", "pincode": "600001", "otp_token": pytest.otp_token,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d
        assert d["user"]["email"] == pytest.otp_email
        assert d["user"]["email_verified"] is True


# ─── Forgot Password Flow ────────────────────────────────────────────────
class TestPasswordReset:
    def test_reset_flow(self, s):
        # Create a fresh customer to reset
        email = f"reset_{uuid.uuid4().hex[:8]}@test.com"
        orig_pw = "OrigPass1"
        new_pw = "NewPass123"
        # Register via OTP first
        r0 = s.post(f"{API}/auth/send-otp", json={"email": email, "purpose": "registration"})
        assert r0.status_code == 200 and r0.json().get("dev_code")
        code0 = r0.json()["dev_code"]
        v0 = s.post(f"{API}/auth/verify-otp", json={
            "email": email, "code": code0, "purpose": "registration",
        })
        s.post(f"{API}/auth/register", json={
            "email": email, "password": orig_pw, "name": "Reset User",
            "phone": "1", "address_line1": "x", "city": "c", "state": "s", "pincode": "1",
            "otp_token": v0.json()["otp_token"],
        })
        # 1. send-otp for password_reset
        r = s.post(f"{API}/auth/send-otp", json={"email": email, "purpose": "password_reset"})
        assert r.status_code == 200
        code = r.json()["dev_code"]
        # 2. verify-otp
        r2 = s.post(f"{API}/auth/verify-otp", json={"email": email, "code": code, "purpose": "password_reset"})
        assert r2.status_code == 200
        token = r2.json()["otp_token"]
        # 3. reset-password
        r3 = s.post(f"{API}/auth/reset-password", json={
            "email": email, "otp_token": token, "new_password": new_pw,
        })
        assert r3.status_code == 200
        # 4. old password fails
        r4 = s.post(f"{API}/auth/login", json={"email": email, "password": orig_pw})
        assert r4.status_code == 401
        # 5. new password works
        r5 = s.post(f"{API}/auth/login", json={"email": email, "password": new_pw})
        assert r5.status_code == 200

    def test_send_otp_reset_unknown_email(self, s):
        # Anti-enumeration: unknown emails get a generic success (no code sent)
        r = s.post(f"{API}/auth/send-otp", json={
            "email": f"nobody_{uuid.uuid4().hex[:6]}@x.com", "purpose": "password_reset"
        })
        assert r.status_code == 200
        assert r.json().get("sent") is True
        assert "dev_code" not in r.json()


# ─── Newsletter ───────────────────────────────────────────────────────────
class TestNewsletter:
    def test_subscribe_idempotent(self, s):
        email = f"news_{uuid.uuid4().hex[:8]}@test.com"
        r1 = s.post(f"{API}/newsletter/subscribe", json={"email": email})
        assert r1.status_code == 200
        r2 = s.post(f"{API}/newsletter/subscribe", json={"email": email})
        assert r2.status_code == 200  # idempotent


# ─── Restock alert ────────────────────────────────────────────────────────
class TestRestockAlert:
    def test_restock_persist(self, s):
        # Grab any product
        p = s.get(f"{API}/products").json()[0]
        r = s.post(f"{API}/restock-alert", json={
            "email": f"restock_{uuid.uuid4().hex[:6]}@test.com",
            "product_id": p["id"],
        })
        assert r.status_code == 200


# ─── Testimonials / Gallery ───────────────────────────────────────────────
class TestTestimonialsGallery:
    def test_testimonials_seeded(self, s):
        r = s.get(f"{API}/testimonials")
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_gallery_seeded(self, s):
        r = s.get(f"{API}/gallery")
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_admin_testimonial_crud(self, s, admin_token):
        r = s.post(f"{API}/admin/testimonials", headers=_auth(admin_token), json={
            "name": "TEST_Person", "quote": "Great stuff!", "rating": 5,
        })
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        # check listed
        got = s.get(f"{API}/testimonials").json()
        assert any(t["id"] == tid for t in got)
        # delete
        d = s.delete(f"{API}/admin/testimonials/{tid}", headers=_auth(admin_token))
        assert d.status_code == 200

    def test_admin_gallery_crud(self, s, admin_token):
        r = s.post(f"{API}/admin/gallery", headers=_auth(admin_token), json={
            "image_url": "https://example.com/g.jpg", "caption": "TEST_gallery", "sort_order": 999,
        })
        assert r.status_code == 200
        gid = r.json()["id"]
        d = s.delete(f"{API}/admin/gallery/{gid}", headers=_auth(admin_token))
        assert d.status_code == 200


# ─── Discounts ────────────────────────────────────────────────────────────
class TestDiscounts:
    def test_percent_discount_on_product(self, s, admin_token):
        products = s.get(f"{API}/products").json()
        # pick one without any active discount to make revert clean
        target = next((p for p in products if p.get("discount_percent", 0) == 0), products[-1])
        slug = target["slug"]
        original_disc = target.get("discount_percent", 0)

        r = s.post(f"{API}/admin/discounts", headers=_auth(admin_token), json={
            "name": f"TEST_disc_{uuid.uuid4().hex[:5]}",
            "type": "percent", "value": 25, "applies_to": "product",
            "target_slug": slug, "is_active": True,
        })
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # product now shows 25%
        p2 = s.get(f"{API}/products/{slug}").json()
        assert p2["discount_percent"] == 25
        assert p2["final_price"] == round(p2["price"] * 0.75, 2)
        # delete resets
        s.delete(f"{API}/admin/discounts/{did}", headers=_auth(admin_token))
        p3 = s.get(f"{API}/products/{slug}").json()
        assert p3["discount_percent"] == 0
        # Restore original discount if it was non-zero
        if original_disc:
            s.put(f"{API}/admin/products/{target['id']}", headers=_auth(admin_token),
                  json={**target, "discount_percent": original_disc})


# ─── Activity Log ─────────────────────────────────────────────────────────
class TestActivity:
    def test_activity_records_discount(self, s, admin_token):
        # create+delete discount to generate log entries
        r = s.post(f"{API}/admin/discounts", headers=_auth(admin_token), json={
            "name": "TEST_activity_disc", "type": "percent", "value": 5,
            "applies_to": "product", "target_slug": "__nonexistent_slug__", "is_active": False,
        })
        did = r.json()["id"]
        s.delete(f"{API}/admin/discounts/{did}", headers=_auth(admin_token))
        r2 = s.get(f"{API}/admin/activity", headers=_auth(admin_token))
        assert r2.status_code == 200
        logs = r2.json()
        assert any(l.get("action_type") == "discount_created" for l in logs)
        for l in logs[:5]:
            assert "admin_email" in l and "entity_id" in l and "action_type" in l


# ─── Analytics ────────────────────────────────────────────────────────────
class TestAnalytics:
    def test_analytics_shape(self, s, admin_token):
        r = s.get(f"{API}/admin/analytics", headers=_auth(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_revenue", "delivered_revenue", "order_counts",
                  "product_count", "customer_count", "newsletter_count",
                  "top_products", "revenue_series", "category_breakdown"):
            assert k in d, f"missing {k}"
        assert len(d["revenue_series"]) == 14
        assert isinstance(d["top_products"], list)
        assert isinstance(d["category_breakdown"], list)


# ─── Upload ───────────────────────────────────────────────────────────────
class TestUpload:
    def test_upload_and_fetch(self, s, admin_token):
        # 1x1 PNG
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
               b"\x00\x00\x01\x01\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/admin/upload", files=files, headers=headers)
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.startswith("/uploads/")
        # accessible via GET
        full = BASE_URL + url
        g = requests.get(full)
        assert g.status_code == 200
        assert g.content == png

    def test_upload_rejects_non_image(self, s, admin_token):
        files = {"file": ("t.txt", io.BytesIO(b"hello"), "text/plain")}
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/admin/upload", files=files, headers=headers)
        assert r.status_code == 400

    def test_upload_requires_admin(self, s):
        files = {"file": ("t.png", io.BytesIO(b"x"), "image/png")}
        r = requests.post(f"{API}/admin/upload", files=files)
        assert r.status_code == 401
