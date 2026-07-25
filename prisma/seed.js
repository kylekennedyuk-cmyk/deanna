require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { pages: publicPages } = require('../src/content/publicPages');
const { homeDefaults } = require('../src/content/homeDefaults');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password', 12);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      role: 'admin',
      email: 'admin@destinationswithdeanna.com',
      name: 'Deanna Admin',
    },
    create: {
      username: 'admin',
      email: 'admin@destinationswithdeanna.com',
      passwordHash,
      role: 'admin',
      name: 'Deanna Admin',
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: 'deanna@destinationswithdeanna.com' },
    update: {},
    create: {
      username: 'deanna',
      email: 'deanna@destinationswithdeanna.com',
      passwordHash,
      role: 'agent',
      name: 'Deanna',
    },
  });

  const defaults = [
    ['site_name', 'Destinations With Deanna'],
    ['site_tagline', 'Disneyland Paris specialist — tailored magical adventures'],
    ['support_email', process.env.SUPPORT_EMAIL || 'hello@destinationswithdeanna.com'],
    ['logo_mode', 'text'],
    ['logo_height', '96'],
    ['logo_max_width', '380'],
    ['logo_height_mobile', '40'],
    ['logo_max_width_mobile', '168'],
    ['footer_intro', 'Disneyland Paris specialist planning with practical advice, tailored itineraries and one place to manage your holiday.'],
    ['primary_colour', '#1a2b40'],
    ['secondary_colour', '#d1a24a'],
    ['background_colour', '#fbf8f3'],
    ['header_background', '#fbf8f3'],
    ['email_notifications_enabled', 'true'],
    ['smtp_from_name', 'Destinations With Deanna'],
    ['smtp_from_email', process.env.SUPPORT_EMAIL || 'hello@destinationswithdeanna.com'],
    ['smtp_reply_to', process.env.SUPPORT_EMAIL || 'hello@destinationswithdeanna.com'],
    ['planner_enabled', 'true'],
    ['maintenance_mode', 'false'],
  ];

  for (const [key, value] of defaults) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  const nav = [
    { label: 'Home', href: '/', location: 'header', sortOrder: 1 },
    { label: 'About', href: '/about', location: 'header', sortOrder: 2 },
    { label: 'Disneyland Paris', href: '/disneyland-paris', location: 'header', sortOrder: 3 },
    { label: 'Offers', href: '/offers', location: 'header', sortOrder: 4 },
    { label: 'Planning Advice', href: '/planning-advice', location: 'header', sortOrder: 5 },
    { label: 'Contact', href: '/contact', location: 'header', sortOrder: 6 },
    { label: 'Start Planning', href: '/planner', location: 'header', sortOrder: 7 },
    { label: 'Privacy', href: '/privacy', location: 'footer', sortOrder: 1 },
    { label: 'Contact', href: '/contact', location: 'footer', sortOrder: 2 },
  ];

  const existingNav = await prisma.navItem.count();
  if (existingNav === 0) {
    await prisma.navItem.createMany({ data: nav });
  }

  const homeSections = JSON.stringify(homeDefaults);

  await prisma.page.upsert({
    where: { slug: 'home' },
    update: {
      title: 'Home',
      seoTitle: 'Destinations With Deanna | Disneyland Paris Specialist',
      seoDesc:
        'Premium Disneyland Paris holiday planning with Deanna. Tailored itineraries, Disney hotels, and specialist advice.',
      sections: homeSections,
      published: true,
    },
    create: {
      slug: 'home',
      title: 'Home',
      seoTitle: 'Destinations With Deanna | Disneyland Paris Specialist',
      seoDesc:
        'Premium Disneyland Paris holiday planning with Deanna. Tailored itineraries, Disney hotels, and specialist advice.',
      sections: homeSections,
      published: true,
    },
  });

  const pages = [
    {
      slug: 'about',
      title: 'About Deanna',
      seoTitle: 'About Deanna | Destinations With Deanna',
      seoDesc: 'Meet Deanna, your Disneyland Paris specialist travel advisor.',
      sections: JSON.stringify([
        {
          type: 'intro',
          title: 'About Deanna',
          text: 'Deanna helps families and couples craft Disneyland Paris holidays that feel personal, polished, and stress-free.',
        },
      ]),
    },
    {
      slug: 'disneyland-paris',
      title: 'Disneyland Paris Guide',
      seoTitle: 'Disneyland Paris Guide | Destinations With Deanna',
      seoDesc: 'Hotels, dining, parks, and planning tips for Disneyland Paris.',
      sections: JSON.stringify([
        {
          type: 'intro',
          title: 'Disneyland Paris',
          text: 'Your hub for parks, hotels, dining, and first-timer advice — curated by a specialist.',
        },
      ]),
    },
    {
      slug: 'planning-advice',
      title: 'Planning Advice',
      seoTitle: 'Planning Advice | Destinations With Deanna',
      seoDesc: 'Practical advice for planning a Disneyland Paris holiday.',
      sections: JSON.stringify([
        {
          type: 'intro',
          title: 'Planning advice',
          text: 'Timing, budgets, park strategy, and what to book early — clear guidance without the overwhelm.',
        },
      ]),
    },
    {
      slug: 'contact',
      title: 'Contact',
      seoTitle: 'Contact | Destinations With Deanna',
      seoDesc: 'Get in touch with Destinations With Deanna.',
      sections: JSON.stringify([
        {
          type: 'intro',
          title: 'Contact',
          text: 'Prefer to chat first? Send a message or start the holiday planner for a tailored proposal.',
        },
      ]),
    },
    {
      slug: 'privacy',
      title: 'Privacy',
      seoTitle: 'Privacy | Destinations With Deanna',
      seoDesc: 'Privacy information for Destinations With Deanna.',
      sections: JSON.stringify([
        {
          type: 'intro',
          title: 'Privacy',
          text: 'We look after your details carefully and only use them to plan and support your holiday.',
        },
      ]),
    },
  ];

  for (const page of pages) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: {},
      create: page,
    });
  }

  for (const [slug, page] of Object.entries(publicPages)) {
    await prisma.page.upsert({
      where: { slug },
      update: {
        title: page.title,
        seoTitle: page.seoTitle,
        seoDesc: page.seoDesc,
        sections: JSON.stringify(page.sections),
        published: true,
      },
      create: {
        slug,
        title: page.title,
        seoTitle: page.seoTitle,
        seoDesc: page.seoDesc,
        sections: JSON.stringify(page.sections),
        published: true,
      },
    });
  }

  console.log('Seed complete.');
  console.log('Default admin login → username: admin  password: password');
  console.log(`Admin id: ${admin.id}, Agent id: ${agent.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
