# Agri-Verify IoT System

Smart agricultural verification and irrigation management platform with real-time monitoring, payment (M-Pesa) integration, and farmer verification.

**This README explains how to get the project running locally, what environment variables are used, where the database lives, and how to access the frontend and admin UI.**

---

## Prerequisites

- Node.js (v16+ recommended)
- npm
- Internet access for M-Pesa sandbox (optional)

---

## Quick start (recommended)

1. Install backend dependencies and start the server:

```bash
cd backend
npm install
npm start
```

2. Open the dashboard in your browser:

```
http://localhost:3000
```

Notes:
- Use `npm run dev` in `backend` to run with `nodemon` for development.
- The backend serves the frontend static files from `frontend/public`.

---

## Project layout

Top-level layout (important parts):

```
backend/                 # Node.js API server
	server.js              # App entrypoint
	package.json           # npm scripts
	seed_data.js           # CLI script to insert sample data
	src/
		models/database.js   # SQLite schema + init
		routes/              # API endpoints (telemetry, mpesa, mock, admin, alerts, farmer)
frontend/public/         # Static front-end (index.html, admin.html, JS)
agri_verify.db           # SQLite DB created at project root after running the server
```

---

## Environment variables

Create a `.env` file in the `backend/` folder or set environment variables in your environment. Supported variables:

- `PORT` — HTTP server port (default: `3000`)
- `ADMIN_JWT_SECRET` — Admin JWT secret (default in code: `dev_admin_secret`)
- M-Pesa (Daraja) related:
	- `MPESA_ENV` — `sandbox` (default) or `production`
	- `MPESA_CONSUMER_KEY` — Daraja consumer key
	- `MPESA_CONSUMER_SECRET` — Daraja consumer secret
	- `MPESA_SHORTCODE` — Business short code
	- `MPESA_PASSKEY` — Passkey for STK Push
	- `MPESA_CALLBACK_URL` — Public callback URL for STK Push (used by Safaricom)

Example `.env` (for local development using sandbox):

```
PORT=3000
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=http://your-server/ngrok-or-public-url/mpesa/callback
ADMIN_JWT_SECRET=change_this_dev_secret
```

If you do not configure M-Pesa credentials, you can still use the mock endpoints under `/mock` for testing payment and verification flows.

---

## Database & seed data

- The app uses SQLite. The database file is created at the repository root as `agri_verify.db` by default (see `backend/src/models/database.js`).
- The schema and some mock data are created automatically when the server starts (`init()` runs on startup).
- To insert additional sample rows, run the seeder manually from the repo root:

```bash
node backend/seed_data.js
```

You can inspect the DB with the `sqlite3` CLI or a GUI SQLite browser:

```bash
sqlite3 agri_verify.db
```

---

## Default admin credentials

- A default admin user is seeded automatically: username `admin`, password `admin123`. Change this in production.

---

## Useful scripts

- Start server: run in `backend` directory `npm start` (runs `node server.js`)
- Dev server (auto-reload): run in `backend` directory `npm run dev` (uses `nodemon`)

---

## API overview

Main endpoints (relative to server base URL):

- `POST /api/telemetry` — Ingest telemetry data from devices (sensor readings)
- `POST /api/alerts` — Create alerts
- `POST /mpesa/stkpush` — Initiate M-Pesa STK Push (requires M-Pesa env vars)
- `POST /mpesa/callback` — M-Pesa callback (used by Safaricom)
- `GET /mpesa/status/:checkoutRequestId` — Query STK Push status
- `POST /mock/gava/verify` — Mock farmer verification (useful for local testing)
- `POST /mock/daraja/stkpush` — Mock payment flow

Admin and farmer routes:

- `/admin` — Admin routes (authentication and admin functions)
- `/farmer` — Farmer-related endpoints

Routes are implemented in `backend/src/routes/` (see files: `admin.js`, `alerts.js`, `farmer.js`, `mock.js`, `mpesa.js`, `telemetry.js`).

---

## WebSocket (real-time)

- Socket.IO server runs on the same port as the backend.
- Events emitted by server: `telemetry`, `payment`, `alert`.

Frontend code connects via the provided `frontend/public/js/socket.js` script.

---

## Frontend

- Static frontend is in `frontend/public/`. No build step is required — the backend serves these files.
- Open `http://localhost:3000/` for the main dashboard and `http://localhost:3000/admin` for the admin UI.

---

## Troubleshooting

- If the frontend doesn't load, ensure the backend is running and listening on the port shown in console.
- If you need public callbacks for M-Pesa while developing locally, use a tunnel like `ngrok` and set `MPESA_CALLBACK_URL` to the public callback URL.
- Check logs in the terminal where you started `npm start` for errors.

---

## Next steps

- Change default passwords and secrets before deploying to production.
- Add HTTPS / reverse proxy when exposing the app publicly.

---

If you'd like, I can also:
- add a `.env.example` file, or
- add an npm script at the repo root to run backend & frontend together.


