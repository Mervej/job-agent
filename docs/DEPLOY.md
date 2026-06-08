# Deploying the backend (free)

Gets the Express backend running on a public URL at **$0**, no credit card, using [Render](https://render.com)'s free web service tier. The repo already contains everything Render needs (`render.yaml`, `/health` endpoint, compiled-JS start script).

> **Free-tier reality check:** the service **sleeps after ~15 min of inactivity** (first request after that takes ~50s to wake), and the disk is **ephemeral** — uploaded resumes and the SQLite DB reset on every restart/redeploy. That's fine for a portfolio demo; for persistence you'd move to a paid plan with a disk, or Postgres + object storage (see the README roadmap).

---

## 1. Get a free Groq API key

The deployed backend uses [Groq](https://console.groq.com) for AI (free tier, no card).

1. Sign in at <https://console.groq.com>.
2. **API Keys → Create API Key**. Copy it (starts with `gsk_`). You'll paste it into Render in step 3.

---

## 2. Push the repo to GitHub

Render deploys from a GitHub repo, so the code must be pushed first.

```bash
git add .
git commit -m "Prepare backend for deployment"
git push -u origin feature/chrome-extension-job-agent   # or merge to master and push that
```

> Secrets are safe: `.gitignore` excludes `.env*` (your real keys), and only the secret-free `.env.example` is committed.

---

## 3. Deploy on Render (Blueprint)

1. Go to <https://dashboard.render.com> → sign up (GitHub login is easiest).
2. **New → Blueprint**.
3. Connect and select this repository. Render detects [`render.yaml`](../render.yaml).
4. It will prompt for the env var marked secret — paste your **`GROQ_API_KEY`**.
5. Click **Apply**. Render runs `npm install && npm run build`, then `npm start`.

First build takes a few minutes (native `better-sqlite3` compile). When it's live you get a URL like:

```
https://job-agent-backend.onrender.com
```

---

## 4. Verify it's up

```bash
curl https://job-agent-backend.onrender.com/health     # {"status":"ok"}
curl https://job-agent-backend.onrender.com/resumes    # {"resumes":[]}
```

(The first call may take ~50s if the service was asleep.)

---

## 5. Point the extension at it (optional, later)

The extension defaults to localhost. To use the deployed backend, edit one line in `extension/background.js`:

```js
const BACKEND_URL = 'https://job-agent-backend.onrender.com';
```

Reload the extension at `chrome://extensions`. The backend's CORS already allows `chrome-extension://` origins, so no backend change is needed.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails on `better-sqlite3` | Confirm `.node-version` is `20`; native prebuilds exist for Node 20. |
| Build downloads a huge browser / times out | Ensure `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set (it's in `render.yaml`). |
| `GROQ_API_KEY not set` on first AI call | Add the key under the service's **Environment** tab and redeploy. |
| `/apply/jobs` errors | Expected — the Playwright filler doesn't run in the cloud. Use `/apply/map-fields` (the extension path). |
| Cold-start delay | Normal on free tier (sleeps after 15 min idle). |
