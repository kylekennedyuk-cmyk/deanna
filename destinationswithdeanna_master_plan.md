# MASTER BUILD PLAN: Destinations With Deanna

## Purpose
Build a premium, modular, information-first holiday website for Disneyland Paris specialist Deanna at destinationswithdeanna.com. The site must not take direct bookings; instead, it should convert visitors into planning requests through a polished holiday planner, then support ongoing collaboration through customer and agent portals.

## Product Goals
- Present Deanna as a specialist travel advisor with a premium Disneyland Paris focus.
- Convert visitors through a beautiful interactive planning journey.
- Give each customer a private login to track their holiday planning.
- Give Deanna a secure workspace to manage requests, proposals, itineraries, messages, and pricing.
- Keep all content, offers, prices, sections, and modules editable from admin.
- Make the system modular so new travel destinations and future features can be added cleanly.

## Brand Direction
- Mood: magical, warm, premium, reassuring, elegant.
- Avoid: clutter, harsh borders, cheap gradients, oversized shadows, generic corporate layouts, bland form design.
- Use: spacious layouts, soft depth, subtle animation, beautiful imagery, rounded cards, refined typography, and clear hierarchy.
- The UI should feel like a premium travel editorial plus a modern concierge portal.

## Core Experience
1. Visitor arrives on a strong homepage with a clear proposition.
2. Visitor explores Disney-focused content, destinations, and guides.
3. Visitor clicks Start Planning Your Perfect Adventure.
4. Visitor completes a multi-step planning wizard.
5. System creates a customer account or invites login after submission.
6. Deanna receives an email notification and sees the request in her dashboard.
7. Deanna builds the holiday plan with flights, hotel, tickets, itinerary, notes, and pricing.
8. Customer logs in to review the plan and message Deanna.
9. The process continues inside a private messaging thread tied to the plan.

## Information Architecture
### Public Site
- Home, About Deanna, Disneyland Paris Guide, Destinations, Hotels, Dining, Things To Do, Planning Advice, Offers and Deals, Contact, Start Planning.

### Customer Area
- Dashboard, My Holiday Planner, Messages, Documents, Profile.

### Agent Area
- Dashboard, New Requests, Active Plans, Messaging Inbox, Itinerary Builder, Pricing Builder, Documents, Notes.

### Admin Area
- Site Content, Pages, Media Library, Deals and Pricing, Navigation, Forms, Users, Modules, Settings, Email Templates.

## Design System
### Layout Rules
- Clean 12-column responsive grid, spacious sections, clear content blocks.
- Mobile-first polish; sticky primary CTA only where helpful.

### Typography
- One elegant display font for headings, one highly readable sans-serif for body.
- Consistent scale across page types and cards.

### Colour Palette
- Primary: deep navy or midnight blue.
- Secondary: soft gold or warm champagne.
- Accent: Disney-inspired pink, lavender, or teal used sparingly.
- Backgrounds: ivory, soft white, pale blush, light neutral sections.
- Status colours: green (success), amber (draft), blue (active), red (issues).

### UI Style
- Rounded cards, soft borders, subtle shadows, elegant spacing.
- Iconography for planning categories, hotels, travel style, dining, and destinations.
- Tasteful motion: fade, slide, hover lift, step transitions, loading states.
- Avoid heavy skeuomorphism and flat, lifeless forms.
- Premium visual treatments for CTAs, featured destinations, and highlights.

## Homepage Structure
### Hero
- Full-width hero image or cinematic background.
- Headline focused on Disneyland Paris expertise.
- Subheadline explaining tailored adventures.
- Primary CTA: Start Planning Your Perfect Adventure.
- Secondary CTA: Explore Disneyland Paris.

### Sections
- Why choose Deanna; Featured highlights; Popular destinations and travel styles.
- How the planning process works; Testimonials or social proof.
- Latest guides and tips; Final conversion block.

## Holiday Planner UX
- Multi-step wizard, not one long page.
- Clear progress, short steps, conditional questions.
- Save progress automatically; return later via email link or login.
- Friendly microcopy and reassuring helper text.
- Rich inputs: toggles, chips, sliders, calendars, checklists, preference cards.

### Recommended Steps
1. Trip basics.
2. Traveller details.
3. Holiday style and preferences.
4. Disneyland Paris interests.
5. Budget and flexibility.
6. Accommodation and travel preferences.
7. Special requirements.
8. Review and submit.

### Data Captured
- Name, email, phone; Party size and ages; Travel dates and flexibility.
- Budget; Preferred airports; Hotel preferences; Likes and dislikes.
- Dining preferences; Accessibility needs; Occasion or celebration.
- Priority destinations and experiences; Anything they absolutely want or want to avoid.

### Completion Flow
- On submit, create request record; create or link customer account.
- Send email to Deanna; send confirmation to customer.
- Open customer dashboard with next steps.

## Customer Portal
- Clean dashboard with current holiday plans.
- Each plan has status, timeline, and messages.
- Customer can view proposals, itinerary, and attached documents.
- Messaging is thread-based and tied to the plan.
- Customer can request changes or ask questions directly.
- UI should feel calm, reassuring, and easy to navigate.

## Agent Portal
- Deanna sees new requests first.
- Dashboard shows priority, status, due dates, and recent messages.
- Each plan has editable sections for flights, accommodation, tickets, transfers, itinerary, notes, and pricing.
- Agent can send updates, upload files, and change plan status.
- Messaging should look like a professional support inbox.
- Include quick actions for common tasks.

## Admin Panel
Everything should be editable.
- Pages and page sections; Hero text and CTAs; Prices and displayed offers.
- Destinations and category cards; Images and media; Navigation and footer.
- Email templates; Form fields and labels; Feature toggles and future modules.
- Site-wide settings.

## Modular Architecture
Build this as feature modules so it can expand later.
Suggested modules: auth, cms, pages, media, planning, customers, agents, messaging, deals, settings, notifications, documents, itineraries, analytics, blog later if needed.

## Technical Direction
- Use Node.js and Express.
- Use a structured module-based codebase.
- Use PostgreSQL with Prisma.
- Use Passport.js or equivalent session auth for login.
- Use role-based access control for customer, agent, and admin.
- Use email notifications for new requests and messages.
- Use reusable components and shared UI primitives.

## Content Requirements
- Disneyland Paris overview pages; Hotel guides; Destination guides.
- Dining tips; Planning advice; Family travel guidance.
- Transport guidance; Seasonal recommendations; First-time visitor advice; Budget guidance.

## Image Requirements
- Use high-quality travel imagery; prioritise Disneyland Paris-style inspiration visuals.
- Add image slots for homepage, destination pages, hotel pages, and guides.
- All images must support alt text and captions.
- Admin must be able to replace images at any time.

## Build Standards
- Mobile responsive; accessible; SEO friendly; fast loading.
- Structured for future expansion; visually polished.
- Easy for non-technical admin editing; no ugly default component library appearance.

## UI Quality Rules
- Do not use generic dashboard templates without custom styling.
- Do not stack too much content in one viewport.
- Do not use boring grey-only interfaces.
- Do not use default form spacing or plain card grids without art direction.
- Do not use random font pairing.
- Do not use excessive borders or boxiness.
- Do not create a "software dashboard" feel on public pages.
- Public pages should feel editorial and luxurious.
- Portal pages should feel modern, polished, and calm.
- Forms must look like a guided experience, not a data dump.

## Recommended Page Patterns
### Home
- Large hero; Clear CTA; Featured cards; Storytelling sections; Strong visual rhythm.

### Guide Pages
- Large intro banner; Article content with side highlights; Related guides; Sticky CTA to planning.

### Planner Pages
- Stepper at top; Left content, right summary on desktop; Clear back and next controls; Soft highlight panels for choices.

### Dashboard Pages
- Summary cards at top; Activity list below; Action buttons grouped logically; Empty states designed properly.

## Cursor Build Order
1. Set up project foundation.
2. Create design system and layout components.
3. Build public homepage and core pages.
4. Build planner wizard.
5. Build login and account flows.
6. Build customer portal.
7. Build agent portal.
8. Build admin CMS.
9. Add messaging and notifications.
10. Add polish, content, media, SEO, and responsiveness.
11. Refine UI until it feels premium.

## Cursor Instruction Block
Use the following as the main instruction to Cursor:

Build a premium modular holiday website for destinationswithdeanna.com. It must be a Disneyland Paris specialist site with a beautiful luxury travel UI, not a generic dashboard. Create a public information hub, an interactive multi-step holiday planning wizard, a customer login portal, an agent portal for Deanna, and a fully editable admin CMS. Use clean modular architecture, reusable components, responsive layouts, role-based authentication, messaging, editable content blocks, and future-proof module structure. Prioritise visual design quality, spacing, typography, cards, and mobile experience. Make the planner feel interactive, elegant, and effortless. Avoid ugly default UI patterns. All site-wide content, prices, offers, images, navigation, and modules must be editable in admin.

## Acceptance Criteria
- Premium travel brand feel.
- Beautiful public site.
- Smooth planner flow.
- Customer login and dashboard.
- Agent login and dashboard.
- Messaging system.
- Admin editing for everything.
- Modular codebase.
- Easy to extend later.
- Excellent mobile UI.
- No ugly generic design.
