require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const {
  homeDefaults,
  needsHomeDefaultsMerge,
  resolveHomeSections,
} = require('../src/content/homeDefaults');

const prisma = new PrismaClient();
const force =
  process.argv.includes('--force') ||
  ['1', 'true'].includes(String(process.env.FORCE || '').toLowerCase());

const homeData = {
  title: 'Home',
  seoTitle: 'Destinations With Deanna | Disneyland Paris Specialist',
  seoDesc:
    'Premium Disneyland Paris holiday planning with Deanna. Tailored itineraries, Disney hotels, and specialist advice.',
  sections: JSON.stringify(homeDefaults),
  published: true,
};

function parseSections(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(
    force
      ? 'Force mode: replacing the home page with bundled defaults.'
      : 'Safe mode: preserving populated CMS content. Use --force or FORCE=1 to replace it.'
  );

  const existing = await prisma.page.findUnique({ where: { slug: 'home' } });
  if (!existing) {
    await prisma.page.create({ data: { slug: 'home', ...homeData } });
    console.log(`Created home page with ${homeDefaults.length} default sections.`);
    return;
  }

  if (force) {
    await prisma.page.update({ where: { slug: 'home' }, data: homeData });
    console.log(`Replaced home page with ${homeDefaults.length} default sections.`);
    return;
  }

  const storedSections = parseSections(existing.sections);
  if (storedSections && needsHomeDefaultsMerge(storedSections)) {
    const sections = resolveHomeSections(storedSections);
    await prisma.page.update({
      where: { slug: 'home' },
      data: { sections: JSON.stringify(sections) },
    });
    console.log(`Filled the empty/legacy home stub with ${sections.length} sections.`);
    return;
  }

  console.log(
    storedSections
      ? 'Skipped home: populated CMS content already exists.'
      : 'Skipped home: sections contain unrecognized data; use --force or FORCE=1 to replace it.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
