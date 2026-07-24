# Deploy on Plesk (simple path)

This app is set up so you do **not** need a separate PostgreSQL/MySQL database. It uses a SQLite file under `/data`.

## 1) Push code to GitHub

Repo: https://github.com/kylekennedyuk-cmyk/deanna

## 2) In Plesk — Node.js

1. Open the domain → **Node.js**
2. Enable Node.js (20+ if available)
3. Set:
   - **Application root:** folder where `package.json` lives (often `httpdocs` or a subfolder)
   - **Application startup file:** `server.js`
   - **Application mode:** `production`
4. Click **NPM install**
5. Open **Custom environment variables** (or create `.env` in the app root) and set at least:

```
NODE_ENV=production
PORT=<use the port Plesk shows, or leave blank if managed>
APP_URL=https://destinationswithdeanna.com
SESSION_SECRET=<long random string>
DATABASE_URL=file:../data/deanna.db
SUPPORT_EMAIL=hello@destinationswithdeanna.com
```

6. In **Run Node.js commands** (or SSH), run once:

```bash
npx prisma generate
npx prisma db push
node prisma/seed.js
npm run build
```

7. **Restart App**

## 3) Log in

Visit: `https://your-domain/login`

- Username: `admin`
- Password: `password`

Change the password after first login (create a new admin user in `/admin/users`, then retire this one).

## 4) File permissions

Ensure the app can write to:

- `data/` (database + sessions)
- `public/uploads/` (future media)

## 5) Optional email

Add SMTP vars when ready (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Until then, emails are logged and skipped.

## Troubleshooting

- **App won’t start:** check Node.js logs in Plesk; confirm `server.js` is the startup file.
- **Login fails after redeploy:** confirm `data/deanna.db` still exists (don’t delete `/data`).
- **CSS looks unstyled:** run `npm run build` so `public/css/app.css` exists.
- **Secure cookie issues on HTTP only:** set `NODE_ENV=production` only behind HTTPS (recommended).
