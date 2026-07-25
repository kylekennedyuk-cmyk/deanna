require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { homeDefaults } = require('../src/content/homeDefaults');

const prisma = new PrismaClient();

async function main() {
  const sections = JSON.stringify(homeDefaults);
  await prisma.page.upsert({
    where: { slug: 'home' },
    update: {
      title: 'Home',
      seoTitle: 'Destinations With Deanna | Disneyland Paris Specialist',
      seoDesc:
        'Premium Disneyland Paris holiday planning with Deanna. Tailored itineraries, Disney hotels, and specialist advice.',
      sections,
      published: true,
    },
    create: {
      slug: 'home',
      title: 'Home',
      seoTitle: 'Destinations With Deanna | Disneyland Paris Specialist',
      seoDesc:
        'Premium Disneyland Paris holiday planning with Deanna. Tailored itineraries, Disney hotels, and specialist advice.',
      sections,
      published: true,
    },
  });
  console.log(`Synced home page with ${homeDefaults.length} sections.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
