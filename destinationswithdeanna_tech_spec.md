# Technical Specification: Destinations With Deanna

## Project Setup
- Node version: 20+
- Package manager: npm or pnpm
- Environment: .env with DATABASE_URL, SESSION_SECRET, SMTP settings, APP_URL
- Commands: `npm run dev` (dev server), `npm run build` (production), `npx prisma migrate dev`

## Tech Stack
- Runtime: Node.js 20+
- Framework: Express.js
- Database: PostgreSQL via Prisma ORM
- Auth: Passport.js (local strategy) with bcrypt for password hashing
- Sessions: express-session with secure cookies
- Templating: EJS with reusable partials and layouts
- Styling: Tailwind CSS + custom theme tokens (no raw component library look)
- Validation: Zod or express-validator for forms
- File Uploads: Local storage (with admin media library) or S3-compatible later
- Email: Nodemailer (SMTP) for notifications and plan updates
- Security: CSRF tokens, rate limiting on auth/planner, input sanitization

## Module Structure
```
src/
  modules/
    auth/
    cms/
    planning/
    customers/
    agents/
    messaging/
    deals/
    settings/
    notifications/
  config/
    database.js
    passport.js
    session.js
    email.js
  middleware/
    auth.js
    roleGuard.js
    csrf.js
    upload.js
  app.js
  server.js
```

## Database Schema (Prisma)
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  customer
  agent
  admin
}

model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String
  role          Role      @default(customer)
  name          String
  phone         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  plans         HolidayPlan[] @relation("PlanCustomer")
  agentPlans    HolidayPlan[] @relation("PlanAgent")
  messages      Message[]
  documents     Document[]
}

enum PlanStatus {
  new
  in_progress
  sent
  completed
  archived
}

model HolidayPlan {
  id            Int         @id @default(autoincrement())
  customerId    Int
  customer      User        @relation("PlanCustomer", fields: [customerId], references: [id])
  agentId       Int?
  agent         User?       @relation("PlanAgent", fields: [agentId], references: [id])
  status        PlanStatus  @default(new)
  travelDates   String
  partySize     Int
  budget        Int
  preferences   Json        // likes, dislikes, interests, requirements
  flights       Json?       // [{airport, airline, outbound, return, price}]
  hotel         Json?       // {hotelId, name, roomType, board, price}
  itinerary     Json?       // [{day, title, notes, activities}]
  pricing       Json?       // breakdown totals
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  messages      Message[]
  documents     Document[]
}

model Message {
  id          Int       @id @default(autoincrement())
  planId      Int
  plan        HolidayPlan @relation(fields: [planId], references: [id])
  senderId    Int
  sender      User      @relation(fields: [senderId], references: [id])
  content     String
  attachment  String?   // file path
  createdAt   DateTime  @default(now())
}

model Page {
  id        Int     @id @default(autoincrement())
  slug      String  @unique
  title     String
  seoTitle  String?
  seoDesc   String?
  sections  Json    // array of content blocks (hero, features, guides, etc.)
  published Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Media {
  id          Int      @id @default(autoincrement())
  url         String
  alt         String?
  caption     String?
  folder      String?  // e.g., 'homepage', 'hotels', 'guides'
  uploadedAt  DateTime @default(now())
}

model Deal {
  id          Int      @id @default(autoincrement())
  title       String
  description String
  price       Int?     // in pence or whole currency unit
  active      Boolean  @default(true)
  startDate   DateTime
  endDate     DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum SettingKey {
  site_name
  site_tagline
  support_email
  smtp_host
  smtp_port
  smtp_user
  smtp_pass
  planner_enabled
  maintenance_mode
}

model SiteSetting {
  key   SettingKey @unique
  value String
}

model Document {
  id          Int       @id @default(autoincrement())
  planId      Int?
  plan        HolidayPlan? @relation(fields: [planId], references: [id])
  userId      Int?
  user        User?     @relation(fields: [userId], references: [id])
  url         String
  name        String
  type        String    // e.g., 'passport', 'insurance', 'itinerary'
  uploadedAt  DateTime  @default(now())
}
```

## Public Site Routes
- GET / – Homepage
- GET /about – About Deanna
- GET /disneyland-paris – Guide hub
- GET /disneyland-paris/hotels – Hotels index + detail
- GET /disneyland-paris/dining – Dining guide
- GET /disneyland-paris/things-to-do – Activities
- GET /planning-advice – Planning tips
- GET /offers – Deals index
- GET /contact – Contact form
- GET /planner – Start planning (wizard)
- GET /pages/:slug – Generic CMS pages

## Planner Wizard Flow
### Step 1: Trip Basics
- Dates (flexible/fixed), Duration (nights), Airport preference (nearest, specific)

### Step 2: Travellers
- Adults count, Children + ages, Occasion (honeymoon, birthday, first-time, etc.)

### Step 3: Style & Preferences
- Pace (relaxed vs packed), Interests (rides, shows, characters, food, shopping)
- Must-haves (park hopper, half-board, transfers), Avoid (crowds, long queues, certain ride types)

### Step 4: Disneyland Focus
- Parks priority (Disneyland Park, Adventure World)
- Lands/areas interest (Frozen, Marvel, Pixar, Adventure)
- Character experiences priority, Dining style (quick service, table service, character dining)

### Step 5: Budget
- Total budget, Per-person budget, Flexibility slider (strict/flexible)

### Step 6: Accommodation
- Hotel type (Disney, partner, apartment), Board basis (room only, breakfast, half-board, full-board)
- Room preferences (view, floor, connecting rooms)

### Step 7: Special Needs
- Accessibility requirements, Dietary restrictions, Celebrations or special requests

### Step 8: Review & Submit
- Summary of all inputs, Terms acceptance, Submit → create HolidayPlan, send email, prompt login/register

## Auth Routes
- GET /login, POST /login
- GET /register (optional), POST /register
- POST /logout
- GET /forgot-password, POST /forgot-password
- GET /reset-password/:token, POST /reset-password/:token

## Customer Portal Routes
- GET /customer – Dashboard
- GET /customer/plans/:id – Plan detail
- GET /customer/plans/:id/messages – Thread
- POST /customer/plans/:id/messages – Send message
- GET /customer/documents/:planId – Documents
- POST /customer/documents/:planId – Upload
- GET /customer/profile – Profile editor

## Agent Portal Routes
- GET /agent – Dashboard
- GET /agent/plans – Plan list
- GET /agent/plans/:id – Plan workspace
  - Tabs: Overview, Flights, Hotel, Itinerary, Pricing, Messages, Documents, Notes
- POST /agent/plans/:id/update – Update sections
- POST /agent/plans/:id/send – Mark as sent
- GET /agent/inbox – Unified inbox
- GET /agent/settings – Agent preferences

## Admin Routes
- GET /admin – Overview
- GET/POST /admin/pages – Page editor
- GET/POST /admin/media – Media library
- GET/POST /admin/deals – Deals manager
- GET/POST /admin/settings – Site settings
- GET/POST /admin/users – User management
- GET/POST /admin/modules – Module toggles
- GET/POST /admin/navigation – Nav and footer
- GET/POST /admin/email-templates – Email templates

## Middleware
- ensureLoggedIn() – Require authentication
- requireRole(['customer','agent','admin']) – Role-based access
- csrfProtection() – CSRF tokens on forms
- rateLimit() – Auth and planner submit limits
- uploadMiddleware() – File upload handling

## Email Events
- New planning request → Deanna
- Plan created/updated → Customer
- New message in plan → Both parties
- Password reset → User

## UI Component Library
### Atoms
- Button (primary, secondary, ghost)
- Input (text, email, tel, date, number)
- Select (single, multi)
- Checkbox, Radio, Toggle
- Card (content, statistic, CTA)
- Badge (status, tag)
- Icon wrapper

### Molecules
- Form field with label + help text
- Stepper indicator
- Plan card with status
- Message thread item
- File upload zone
- Pricing breakdown block

### Layouts
- Page shell (header, footer, main)
- Dashboard shell (sidebar, top bar, content)
- Wizard layout (stepper, content, summary panel)
- Card grid responsive patterns

## Tailwind Theme Tokens
Define in tailwind.config.js:
- Colors: primary (deep navy), secondary (soft gold), accent (Disney-inspired pink/teal), neutrals
- Fonts: display (elegant serif or refined sans), body (highly readable sans)
- Spacing scale: generous section padding
- Shadows: soft, elevated card shadows
- Borders: subtle, rounded corners

## Security & Quality
- CSRF on all state-changing forms
- Input validation on all endpoints
- File type/size validation
- Rate limiting on auth and planner
- Secure session cookies
- HTTPS in production
- Audit logging for admin actions

## Build Checklist
1. Project init, Tailwind theme, base layout, auth
2. CMS pages and homepage sections
3. Planner wizard end-to-end with email
4. Customer portal (dashboard, plans, messages, docs)
5. Agent portal (dashboard, plan builder, pricing, inbox)
6. Admin (pages, media, deals, settings, navigation)
7. Polish: responsive, SEO, performance, content
