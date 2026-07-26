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
| Node.js version | **20 or 22 LTS** (avoid 25) |
| Application root | `/httpdocs` (folder containing `package.json`) |
| Application startup file | `server.js` |
| Application mode | `production` |
| **Document root** | **`/httpdocs/public`** |

> **Document root must be `/httpdocs/public`.**
> If it points at `/httpdocs`, the web server looks for CSS at `/httpdocs/css/app.css` (wrong place),
> so the site loads as unstyled HTML and `/health` returns “file not found”.
> Static assets live in `public/`; everything else is passed to Node.

3. Click **NPM install**

### 3b) Remove any old WordPress files (critical if this domain used WordPress before)

If **only the homepage works** and `/about`, `/login`, `/health` show Apache **500 Internal Server Error**, a leftover WordPress `.htaccess` / `index.php` is almost always the cause. Apache rewrites those URLs to PHP instead of Node.

In **File Manager**, delete these if they exist:

**Inside `httpdocs/public/`:**
- `.htaccess` that mentions WordPress / `index.php` (replace it with the one from this repo after pull)
- `index.php`, `wp-config.php`, `xmlrpc.php`, `license.txt`, `readme.html`
- folders `wp-admin`, `wp-includes`, `wp-content`

**Inside `httpdocs/` (app root):**
- any WordPress `index.php` / `wp-*` leftovers that are not part of this Node app

Then pull so `public/.htaccess` from this repo is present, and **Restart App**.

### 4) Environment variables (important)

Plesk’s **Run script** box often does **not** pass the Node.js panel environment variables to Prisma.  
Create a real `.env` file so both Passenger and scripts can see the settings.

1. Open **File Manager** → `httpdocs`
2. Add a new file named `.env`
3. Paste this (replace the two secrets with your own):

```env
NODE_ENV=production
APP_URL=https://destinationswithdeanna.com
SESSION_SECRET=paste-your-long-random-string-here
SETTINGS_ENCRYPTION_KEY=paste-a-different-long-random-string-here
DATABASE_URL=file:../data/deanna.db
SUPPORT_EMAIL=hello@destinationswithdeanna.com
```

Notes:

- `DATABASE_URL` **must** start with `file:`
- Do **not** set `PORT` — Passenger chooses the port
- Keep the same values in the Node.js panel if you like, but `.env` is required for `deploy`
- A template is also in the repo as `.env.plesk`

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
- seeds missing admin/default records and pages without replacing existing CMS page content
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

`update` refreshes the Prisma client, applies schema changes and rebuilds CSS. It does not seed or sync pages, so content edited in Admin → Pages is preserved.

`deploy` and `db:seed` are also safe for existing CMS pages: they create missing defaults but do not replace page titles, SEO or sections.

The explicit content sync commands run in safe mode by default. They create missing pages and fill empty stubs, while skipping pages that already contain CMS content:

```bash
npm run content:sync
npm run content:sync-home
```

Only force-reset pages when you intentionally want to discard Admin edits and restore the bundled repo defaults:

```bash
npm run content:sync -- --force
npm run content:sync-home -- --force
# Alternatively on Linux/Plesk:
FORCE=1 npm run content:sync
```

Force sync is destructive for the affected page content and should never be part of a routine pull/update.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| **Site loads unstyled / no CSS** | Document root is wrong. Set it to `/httpdocs/public`, then Restart App |
| **`/health` says “file not found”** | Same cause — set document root to `/httpdocs/public` |
| **Home works, every other page is Apache 500** | Leftover WordPress. Delete `public/.htaccess` (WordPress one), `public/index.php`, and `wp-*` folders. Pull so the repo’s `public/.htaccess` is installed, then Restart App |
| **Guide pages only show a CTA / missing hotels & dining** | Review and edit the page in Admin → Pages. Safe `content:sync` only creates missing pages or fills empty stubs; force sync is a destructive manual reset, not a routine fix |
| `npm error Missing script: "npx"` | Plesk's Run script box takes a script **name** only. Use `deploy` or `update` |
| `DATABASE_URL is missing` when running a script | Create `httpdocs/.env` with `DATABASE_URL=file:../data/deanna.db` — panel env vars are often ignored by Run script |
| `EADDRINUSE :::3000` | Do not run script `start`. Passenger already runs the app. Use `deploy`, then **Restart App**. Remove any `PORT` variable |
| **Internal Server Error** | Almost always means the database was never created. Pull latest code, create `.env`, run script `deploy`, then **Restart App**. Also confirm `DATABASE_URL=file:../data/deanna.db` and `data/` is writable |
| App won’t start / Passenger error | Use Node **20 or 22 LTS** (not 25). Check logs. Create `.env`, run `deploy`, Restart App |
| Blank / unstyled pages | Run `npm run build` so `public/css/app.css` exists |
| Login fails after redeploy | Do not delete `data/`; the SQLite DB and sessions live there |
| 502 / proxy errors | Confirm the Node app is enabled and listening on the port Plesk expects |
| Emails not sending | Configure Admin → Email & notifications and use **Send test email**; check spam |
| SMTP password “forgotten” | `SETTINGS_ENCRYPTION_KEY` was changed — set the password again in admin |
| Uploads fail | Ensure `public/uploads` is writable |
| Planner closed / maintenance page | Turn those off in Admin → Settings |
| 3CX chat / call widget | Admin → Settings → **Live chat & calls (3CX)**. Enable, paste phonesystem URL + party id from 3CX Live Chat embed. Optional Talk URL and call number. Widget is public-site only |

Health check: `https://your-domain/health` should return `{"ok":true}`.

### Passenger “We're sorry, but something went wrong”

This Phusion Passenger page means the Node process **failed to start** or **died** and could not be respawned. It is different from a normal Express 500 page.

**Where to look for logs**

1. Plesk → Domains → your domain → **Logs** (or **Node.js** → open the application log / error log)
2. SSH (paths vary by host; common locations):
   - `/var/www/vhosts/SYSTEM_USER/logs/error_log` (Apache / Passenger)
   - `/var/www/vhosts/YOUR-DOMAIN/logs/error_log`
   - Passenger often also prints Node `stdout`/`stderr` into the same error log
3. App file log (after this deploy): `httpdocs/data/logs/app.log` (rotates at ~2 MB)

**Reading the Passenger error ID**

The sorry page shows an error ID. Search the error log for that ID — the lines immediately above/below usually include the real Node stack (missing module, Prisma schema mismatch, unhandled exception, port conflict).

**Typical causes after a code pull**

1. **Pending schema changes not applied** — new models such as `MessageRead`, `ChangeRequest`, or booking fields on `HolidayPlan` need `prisma db push`. Run script **`update`** (or `deploy` on a fresh install), then **Restart App**. Startup now logs a clear “schema appears out of date” warning if tables/columns are missing.
2. **Missing `.env` / `DATABASE_URL`** — create `httpdocs/.env` as in step 4 above.
3. **Unhandled background failures** — outbound email / IMAP used to be able to kill the Node 20 process via unhandled promise rejections. Current builds log these and keep the process alive (uncaught exceptions still exit so Passenger can respawn cleanly).

**Quick recovery**

```bash
cd /path/to/httpdocs   # folder with package.json
git pull origin main
npm install
npm run update         # prisma generate + db push + CSS
# then in Plesk Node.js → Restart App
```

Or in the Plesk Node.js panel: **NPM install** → Run script `update` → **Restart App**.

If the site keeps dying every few hours, grab the Passenger error ID + matching log lines and check `data/logs/app.log` for `Unhandled promise rejection` or `Uncaught exception`. Also confirm Passenger memory limits in the Node.js panel are not killing a healthy process.

---

## Default accounts (seed)

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `password` |
| Agent | `deanna` | `password` |

Change both in production.
