# Paper & Loop

Premium youth merchandise — posters and keychains. Editorial e-commerce built with React + FastAPI + MongoDB.

## Stack

- **Frontend:** React 19, React Router, Tailwind, shadcn/ui, Framer Motion (Vercel)
- **Backend:** FastAPI, Motor (MongoDB)
- **Database:** MongoDB Atlas
- **Email:** [Resend](https://resend.com) (verified domain: `paperloop.shop`)
- **Images:** Supabase Storage (public HTTPS URLs). Local `/uploads/*` is dev-only fallback.

## Quick start

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full local and production setup.

```powershell
# Backend
cd backend
copy .env.example .env
# Edit .env — set MONGO_URL, RESEND_API_KEY, FROM_EMAIL
pip install -r requirements.txt
python -m uvicorn server:app --reload --port 8000

# Frontend
cd frontend
copy .env.example .env
npm install --legacy-peer-deps
npm start
```

Products and brand assets are seeded automatically from `Images/` on first backend startup.

## Email / OTP authentication

OTP codes are sent via **Resend** using your verified domain.

Required in `backend/.env`:

```env
RESEND_API_KEY=re_xxxxxxxx
FROM_EMAIL=Paper & Loop <noreply@paperloop.shop>
APP_ENV=production
```

**Rate limits:** 1 OTP per 60 seconds, 5 OTPs per hour per email, 5 verification attempts per code.

**Test email (development only):**

```powershell
curl -X POST http://localhost:8000/api/debug/test-email -H "Content-Type: application/json" -d "{\"email\":\"you@example.com\"}"
```

## Production

- Frontend → **Vercel** (`frontend/`, set `REACT_APP_BACKEND_URL`)
- Backend → **Railway** or **Render** + **Supabase Storage** for media
- Database → **MongoDB Atlas**
- Email → **Resend** with `FROM_EMAIL=Paper & Loop <noreply@paperloop.shop>`

Full guide: [DEPLOYMENT.md](./DEPLOYMENT.md)
