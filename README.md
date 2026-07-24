# Destinations With Deanna

Premium Disneyland Paris holiday planning site with public pages, multi-step planner, customer/agent portals, and admin CMS.

## Current features

- Image-led Disneyland Paris guide, hotels, dining and planning advice pages
- Multi-step holiday planner with session progress
- Customer plans, messages, documents and email preferences
- Agent request dashboard, plan builder, pricing and messaging
- Visual CMS section editor with preview
- Media library with image metadata and folders
- Editable branding, logo, navigation and footer
- Dashboard-managed SMTP, branded notification templates and test email
- Email notifications for requests, messages and plan status changes
- Secure one-time password reset links

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
| Media library | `/admin/media` |
| Email settings | `/admin/notifications` |

## Plesk deploy

See [DEPLOY-PLESK.md](./DEPLOY-PLESK.md) — designed for minimal effort.

## Style guide & QA

- [STYLE-GUIDE.md](./STYLE-GUIDE.md) — fonts, tokens, components
- [UI-CHANGES.md](./UI-CHANGES.md) — redesign summary
- Screenshots in `docs/qa/` (homepage, planner, customer, agent — desktop + mobile hero)

## Content defaults

New installations receive the full specialist content automatically from the seed. To intentionally replace existing public CMS content with the current bundled defaults, run:

```bash
npm run content:sync
```

This command overwrites the affected public page content, so do not use it after editing those pages in admin unless that is intentional.
