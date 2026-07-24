# Destinations With Deanna

Premium Disneyland Paris holiday planning site with public pages, multi-step planner, customer/agent portals, and admin CMS.

## Default admin login

- **Username:** `admin`
- **Password:** `password`

Change this password after first login.

## Local setup (Windows)

```bash
npm run setup
npm run dev
```

Open http://localhost:3000

## Stack

- Node.js 20+ / Express / EJS / Tailwind
- Passport.js local auth (session)
- SQLite via Prisma (no separate database server — easy on Plesk)

## Useful URLs

| Area | URL |
|------|-----|
| Home | `/` |
| Planner | `/planner` |
| Login | `/login` |
| Customer | `/customer` |
| Agent | `/agent` |
| Admin | `/admin` |

## Plesk deploy

See [DEPLOY-PLESK.md](./DEPLOY-PLESK.md) — designed for minimal effort.

## Spec docs

- `destinationswithdeanna_master_plan.md`
- `destinationswithdeanna_tech_spec.md`
