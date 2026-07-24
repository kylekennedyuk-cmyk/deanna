# UI redesign summary (Disney-luxury pass)

## Theme

- `tailwind.config.js` — navy / gold / teal-blush tokens, Cormorant + DM Sans, card radius, soft shadows, float/fade/toast animations
- `src/styles/input.css` — button, card, field, chip, stepper, portal, toast, reduced-motion
- Fonts loaded in `views/partials/shell-start.ejs`

## Shared

- `src/utils/format.js` — status labels, money, preference entries, plan titles
- Partials: preferences-list, status-badge
- `public/js/ui.js` — chips, collapsibles, toasts, quick replies

## Surfaces

- Homepage — cinematic hero, float card, editorial guide band, refined CTAs
- Planner — progress bar stepper, chips, sticky summary, mobile bottom CTA, no JSON on review
- Customer dashboard — summary KPI cards + plan cards with actions
- Customer plan — collapsible human sections (prefs/flights/hotel/itinerary/pricing/messages)
- Agent dashboard — KPI cards + prioritized columns
- Agent plan — left workspace + right sticky action panel, labeled edit fields, send-to-client CTA
- Inbox — search + card thread list

## Explicitly removed

- Raw `JSON.stringify` preference dumps on customer and agent plan views
