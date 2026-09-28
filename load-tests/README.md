# k6 Load Testing Suite

This directory contains automated performance and load testing scripts using **Grafana k6**.

---

## 🚀 Quick Start

### 1. Smoke Test (Quick sanity check: 3 users, 10 seconds)
```bash
npm run test:smoke
```

### 2. Full Website Load Test (Ramps up to 25 users with HTML reporting)
```bash
npm run test:load
```

### 3. High-Concurrency API Load Test (Up to 75 simultaneous users hitting backend APIs)
```bash
npm run test:api
```

---

## ⚡ High-Concurrency API Load Testing

The [`load-tests/api-load-test.js`](file:///e:/transcript/load-tests/api-load-test.js) script stresses the critical backend APIs:
* `GET /api/auth/session` (Dynamic session verification executed on every client visit)
* `GET /api/auth/csrf` (CSRF token generation)
* `GET /api/auth/providers` (OAuth providers config)
* `POST /api/upload-session` (Upload initiation, quota calculation & Gemini key rotation)
* `GET /api/history` (Database querying and pagination via Prisma & Neon PostgreSQL)
* `POST /api/transcribe` (Transcription validation & error boundaries)

### Testing Against Production:
```bash
k6 run -e TARGET_URL=https://ebook-transcript.vercel.app load-tests/api-load-test.js
```

### Testing as an Authenticated User (Optional):
To test authenticated 200 responses for `/api/history` and `/api/upload-session`, pass your browser session cookie:
```bash
k6 run -e TARGET_URL=https://ebook-transcript.vercel.app -e SESSION_COOKIE="your_token_value_here" load-tests/api-load-test.js
```

---

## 📊 Viewing the Interactive HTML Reports

Every test run generates an interactive visual dashboard:
* **Page Load Test Report:** `load-tests/report.html`
* **API Load Test Report:** `load-tests/api-report.html`

To open them on Windows:
```powershell
Start-Process load-tests/api-report.html
```

---

## ⚙️ Customizing Concurrency on the Fly

You can stress test with any number of simultaneous users:

```bash
# 50 simultaneous users for 30 seconds against APIs
k6 run --vus 50 --duration 30s -e TARGET_URL=https://ebook-transcript.vercel.app load-tests/api-load-test.js

# 100 simultaneous users for 1 minute
k6 run --vus 100 --duration 1m -e TARGET_URL=https://ebook-transcript.vercel.app load-tests/api-load-test.js
```
