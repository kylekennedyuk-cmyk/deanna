require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const page = await prisma.page.findUnique({ where: { slug: 'home' } });
  if (!page) {
    console.log('No home page found.');
    return;
  }
  let sections;
  try {
    sections = JSON.parse(page.sections || '[]');
  } catch {
    sections = [];
  }
  const hero = sections.find((section) => section.type === 'hero');
  if (hero) {
    hero.headline = 'Disneyland Paris holidays, planned around your family';
    hero.subheadline =
      'Deanna is a specialist who knows the parks, hotels and the small details that make a trip effortless — from hotel choice to dining, tickets and pacing.';
    hero.primaryCta = { label: 'Start planning your trip', href: '/planner' };
    hero.secondaryCta = { label: 'Explore the guide', href: '/disneyland-paris' };
  }

  const why = sections.find((section) => section.type === 'why');
  if (why && Array.isArray(why.items)) {
    why.items.forEach((item) => {
      if (item.title === 'Calm support') item.title = 'Ongoing support';
    });
  }
  await prisma.page.update({
    where: { slug: 'home' },
    data: { sections: JSON.stringify(sections) },
  });
  console.log('Home hero updated.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
