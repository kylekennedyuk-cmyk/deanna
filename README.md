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
- Official 3CX Live Chat & Talk widget on the public site (Admin → Settings)
- Dashboard-managed SMTP, branded notification templates and test email
- Email notifications for requests, messages and plan status changes
- Secure one-time password reset links

## Default admin login

- **Username:** `admin`
- **Password:** `password`

Change this password after first login.

## 3CX live chat & calls

1. In 3CX Admin go to **Voice & chat → Live Chat** and open **Information** / the HTML embed snippet.
2. Copy the `phonesystem-url` (e.g. `https://company.3cx.uk`) and `party` id (e.g. `LiveChat12345`).
3. In the site: **Admin → Settings → Live chat & calls (3CX)** — set Widget to Enabled, paste URL + party (or the full snippet into the advanced field).
4. Style colours/icons in **3CX Admin → Voice & chat → Live Chat → Styling** (the site embeds the official 3CX bubble only).
5. Save. The public site shows the native 3CX chat bubble. Portals (admin/agent/customer) never show the widget.

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

New installations receive the full specialist content automatically from the seed. Routine `deploy`, `update` and `db:seed` runs preserve pages edited in the admin CMS.

The explicit sync commands are also safe by default: they create missing pages or fill empty/legacy stubs, and skip populated CMS pages.

```bash
npm run content:sync
npm run content:sync-home
```

To intentionally discard CMS edits and replace content with the bundled defaults, use force mode:

```bash
npm run content:sync -- --force
npm run content:sync-home -- --force
# Or set FORCE=1 in the command environment.
```

Force sync is destructive and should only be run as a manual reset, never as part of a routine deployment.
