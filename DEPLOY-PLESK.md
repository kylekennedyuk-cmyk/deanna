# Deploy Destinations With Deanna on Plesk

This is the simplest production path. The app uses **SQLite** (no MySQL/PostgreSQL to set up) and runs as a Node.js application in Plesk.

GitHub repo: https://github.com/kylekennedyuk-cmyk/deanna

---

## Before you start

Have ready:

- Your domain pointed at the Plesk server (e.g. `destinationswithdeanna.com`)
- SSH access (recommended) or Plesk’s “Run Node.js commands”
- Node.js **20+** available in Plesk

Generate two long random secrets (PowerShell examples):

```powershell
# SESSION_SECRET
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})

# SETTINGS_ENCRYPTION_KEY (different value)
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Keep `SETTINGS_ENCRYPTION_KEY` forever once SMTP passwords are saved in admin — changing it breaks decryption.

---

## Option A — Deploy from GitHub (recommended)

### 1) Create or open the domain in Plesk

1. Domains → your domain
2. Prefer a clean document root for the app (e.g. `httpdocs` or a dedicated folder)

### 2) Pull the code

**Via Git (Plesk Git extension):**

1. Domain → **Git**
2. Repository URL: `https://github.com/kylekennedyuk-cmyk/deanna.git`
3. Deploy to your application folder (where `package.json` will live)
4. Deploy / pull `main`

**Or via SSH:**

```bash
cd /var/www/vhosts/YOUR-DOMAIN/httpdocs
# If the folder already has default Plesk files, use a subfolder instead, e.g. app/
git clone https://github.com/kylekennedyuk-cmyk/deanna.git .
# or: git clone https://github.com/kylekennedyuk-cmyk/deanna.git app && cd app
```

### 3) Enable Node.js

1. Domain → **Node.js** → Enable
2. Set:

| Setting | Value |
|--------|--------|
| Node.js version | **20+** |
| Application root | folder containing `package.json` |
| Application startup file | `server.js` |
| Application mode | `production` |
| Document root | usually the same app folder (or as Plesk requires for Node proxy) |

3. Click **NPM install**

### 4) Environment variables

Create a `.env` file in the application root (same folder as `package.json`), or use Plesk **Custom environment variables**:

```env
NODE_ENV=production
APP_URL=https://destinationswithdeanna.com
PORT=3000
SESSION_SECRET=paste-your-long-random-string-here
SETTINGS_ENCRYPTION_KEY=paste-a-different-long-random-string-here
DATABASE_URL=file:../data/deanna.db
SUPPORT_EMAIL=hello@destinationswithdeanna.com
```

Notes:

- If Plesk shows a specific port for the Node app, set `PORT` to that value (or leave blank only if Plesk injects it for you).
- `APP_URL` must be your live HTTPS URL (used in emails and reset links).
- Do **not** commit `.env` to Git.

### 5) One-time setup

**In Plesk (easiest):** Node.js panel → **Run script** → type just:

```text
deploy
```

Leave the parameters box empty and click Run.

> Plesk's "Run script" box runs `npm run <name>`, so it only accepts script names from `package.json`.
> Typing `npx prisma generate` there fails with `Missing script: "npx"`.

**Via SSH instead:**

```bash
cd /path/to/app
npm run deploy
```

What `deploy` does:

- generates the Prisma client
- creates `data/deanna.db`
- seeds admin user + default pages/nav/settings
- builds Tailwind CSS into `public/css/app.css`

### 6) Writable folders

Ensure the app can write to:

```text
data/
public/uploads/
```

SSH example (adjust user/path for your host):

```bash
mkdir -p data public/uploads
chmod -R u+rwX data public/uploads
```

### 7) Restart the Node app

In Plesk Node.js → **Restart App** (or Enable / Disable once).

### 8) First login

Open: `https://your-domain/login`

| Field | Value |
|-------|--------|
| Username | `admin` |
| Password | `password` |

**Change this password immediately** after login (create a new admin in `/admin/users`, then stop using the default credentials).

---

## Option B — Upload ZIP (if you prefer not to use Git on the server)

1. Download the repo ZIP from GitHub → Extract
2. Upload contents into the app folder via Plesk File Manager
3. Continue from **Enable Node.js** (step 3 above)

---

## After go-live checklist

1. **Admin → Brand settings** — company name, logo upload (via Media), colours, contact details, social links
2. **Admin → Navigation** — confirm header/footer links
3. **Admin → Media** — upload logo and page images
4. **Admin → Email & notifications** — SMTP host/port/user/password, From name/email, Reply-to, then **Send test email**
5. **Admin → Pages** — review homepage and guide content in the visual editor
6. Create the real **agent** login for Deanna if needed (`/admin/users`)
7. Turn on HTTPS / Let’s Encrypt in Plesk if not already enabled

SMTP can be configured entirely in the dashboard. The password is encrypted with `SETTINGS_ENCRYPTION_KEY`. You can also set env SMTP vars; dashboard settings take priority when filled.

---

## Updating the site later

1. Pull the latest code (Plesk **Git** → Pull, or `git pull origin main` over SSH)
2. Click **NPM install** in the Node.js panel
3. Run script: `update`
4. **Restart App**

Over SSH the equivalent is:

```bash
cd /path/to/app
git pull origin main
npm install
npm run update
```

`update` refreshes the Prisma client, applies schema changes and rebuilds CSS — without re-running the seed.

Do **not** re-run `node prisma/seed.js` on an existing live site unless you intend to re-seed missing defaults only (seed is upsert-safe for many keys, but `npm run content:sync` overwrites public page content deliberately).

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `npm error Missing script: "npx"` | Plesk's Run script box takes a script **name** only. Use `deploy` or `update` |
| App won’t start | Check Node.js logs in Plesk; confirm startup file is `server.js` and Node 20+ |
| Blank / unstyled pages | Run `npm run build` so `public/css/app.css` exists |
| Login fails after redeploy | Do not delete `data/`; the SQLite DB and sessions live there |
| 502 / proxy errors | Confirm the Node app is enabled and listening on the port Plesk expects |
| Emails not sending | Configure Admin → Email & notifications and use **Send test email**; check spam |
| SMTP password “forgotten” | `SETTINGS_ENCRYPTION_KEY` was changed — set the password again in admin |
| Uploads fail | Ensure `public/uploads` is writable |
| Planner closed / maintenance page | Turn those off in Admin → Settings |

Health check: `https://your-domain/health` should return `{"ok":true}`.

---

## Default accounts (seed)

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `password` |
| Agent | `deanna` | `password` |

Change both in production.
