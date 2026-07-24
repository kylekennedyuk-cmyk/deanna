# Destinations With Deanna — Style Guide

Premium Disneyland Paris concierge aesthetic: warm, sophisticated, family-friendly luxury. No Disney trademark fonts or logos.

## Fonts

| Role | Font | Usage |
|------|------|--------|
| Display | **Cormorant Garamond** | H1–H4 only, tracking-wide, storybook elegance |
| Body | **DM Sans** | UI, paragraphs, forms, 16px base |

## Colour tokens

| Token | Hex / role |
|-------|------------|
| `primary-900` / `primary-950` | Deep navy — primary CTAs, headings |
| `secondary-400` / `secondary-500` | Warm gold — accents, borders, badges |
| `accent-400` / `accent-blush` | Soft teal / blush — highlights |
| `ivory` `#fbf8f3` | Page background |
| `blush` `#f8efe8` | Soft section washes |

## Radius & shadow

- Cards: `rounded-card` (~18px)
- Buttons / chips: `rounded-full` (pill)
- Shadows: `shadow-soft`, `shadow-card`, `shadow-lift`, gold hover glow sparingly

## Buttons

- **Primary** — navy fill, white text, pill, hover lift
- **Secondary** — ghost with gold border
- **Ghost** — text/subtle fill
- **Destructive** — deep red (rare)

## Cards

- Soft border, ivory/white surface, gentle lift on hover
- Optional gold accent line via `.card-accent`

## Badges / status pills

- `new` teal wash
- `in_progress` navy wash
- `sent` gold wash
- `completed` green wash

## Components to reuse

| Class / partial | Purpose |
|-----------------|---------|
| `.btn-primary` / `.btn-secondary` / `.btn-ghost` | CTAs |
| `.card` / `.card-hover` / `.card-accent` | Surfaces |
| `.field` / `.label` / `.help` / `.error-text` | Forms |
| `.chip` / `.chip-active` | Planner selectors |
| `.stepper-track` / `.stepper-fill` | Wizard progress |
| `.sticky-panel` | Desktop summary rails |
| `.kv-row` | Human key/value lists |
| `partials/preferences-list` | Formatted prefs (never raw JSON) |
| `partials/status-badge` | Status pills |
| `public/js/ui.js` | Toasts, chips, collapsibles, quick replies |

## Motion

- 150–300ms ease transitions
- Hero float: `animate-floaty` (honours `prefers-reduced-motion`)
- Toast: `animate-toastIn`

## Accessibility

- Visible `:focus-visible` gold ring
- Labels on all inputs; `aria-live` toast region
- Stepper and tabs keyboard reachable via native links/buttons
- Contrast: navy-on-ivory / white-on-navy for primary actions

## Spacing

- Public sections: `py-20` → `lg:py-28` (~80–112px)
- Portals: `section-sm` for denser but still airy layouts
