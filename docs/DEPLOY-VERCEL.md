# Deploy Autonomi to Vercel

Deploy the **web app** (static site) to Vercel. The **backend** runs elsewhere (e.g. Railway, Render) and is wired via an env var.

## 1. Deploy the frontend (Vercel)

### Connect the repo

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. **Add New** → **Project** → import your GitHub repo `autonomi`.
3. **Configure:**
   - **Framework Preset:** Other
   - **Root Directory:** leave default (repo root)
   - **Build Command:** `node scripts/vercel-env.js`
   - **Output Directory:** `web`
   - **Install Command:** leave empty (or `echo ok` if Vercel requires one)

### Set the backend URL

4. In the project, go to **Settings** → **Environment Variables**.
5. Add:
   - **Name:** `AUTONOMI_API_URL`
   - **Value:** your backend URL, e.g. `https://your-app.railway.app` or `https://autonomi-api.onrender.com`
   - **Environment:** Production (and Preview if you want)

6. **Redeploy** (Deployments → ⋮ on latest → Redeploy) so the new env is applied.

After deploy, the site will load `config.js` (generated at build time with `AUTONOMI_API_URL`) so Dashboard, Alerts, Community, and Developers use that API.

---

## 2. Deploy the backend (e.g. Railway or Render)

Vercel hosts **static sites and serverless functions**, not a long‑running Node server. Run the backend on a platform that supports a persistent process.

### Option A: Railway

1. Go to [railway.app](https://railway.app) and create a project.
2. **Add service** → **GitHub repo** → select `autonomi`, set **Root Directory** to `backend`.
3. **Variables:** add the same env vars you use locally (e.g. `AUTONOMI_ADDRESS`, `AGENT_PRIVATE_KEY`, `ARC_RPC_URL`, optional `TWILIO_*`, etc.).
4. **Settings** → **Deploy** → set **Start Command** to `npm run dev:server` or `npm start` (after build).
5. **Settings** → **Networking** → **Generate Domain**. Copy the URL (e.g. `https://autonomi-backend.up.railway.app`).
6. In Vercel, set **AUTONOMI_API_URL** to that URL and redeploy the frontend.

### Option B: Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect the repo, set **Root Directory** to `backend`.
3. **Build:** `npm install && npm run build`
4. **Start:** `npm start`
5. Add env vars in the Render dashboard.
6. After deploy, copy the service URL and set **AUTONOMI_API_URL** in Vercel.

---

## 3. CORS

The backend already sends `Access-Control-Allow-Origin: *`. If you restrict CORS later, allow your Vercel domain (e.g. `https://your-project.vercel.app`).

---

## Summary

| What        | Where     | Notes                                              |
|------------|-----------|----------------------------------------------------|
| Static web | Vercel    | Root = repo, Build = `node scripts/vercel-env.js`, Output = `web` |
| Backend API| Railway / Render / Fly.io | Run `backend` with your env vars          |
| API URL    | Vercel env `AUTONOMI_API_URL` | Backend base URL, no trailing slash       |

Users can still override the API with the query param: `?api=https://other-api.example.com`.
