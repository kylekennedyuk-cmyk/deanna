require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { pages } = require('../src/content/publicPages');

const prisma = new PrismaClient();
const force =
  process.argv.includes('--force') ||
  ['1', 'true'].includes(String(process.env.FORCE || '').toLowerCase());

function isEmptyStub(value) {
  if (!value || !value.trim()) return true;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log(
    force
      ? 'Force mode: replacing public pages with bundled defaults.'
      : 'Safe mode: preserving populated CMS content. Use --force or FORCE=1 to replace it.'
  );

  for (const [slug, page] of Object.entries(pages)) {
    const data = {
      title: page.title,
      seoTitle: page.seoTitle,
      seoDesc: page.seoDesc,
      sections: JSON.stringify(page.sections),
      published: true,
    };
    const existing = await prisma.page.findUnique({ where: { slug } });

    if (!existing) {
      await prisma.page.create({ data: { slug, ...data } });
      console.log(`Created ${slug}`);
    } else if (force || isEmptyStub(existing.sections)) {
      await prisma.page.update({ where: { slug }, data });
      console.log(`${force ? 'Replaced' : 'Filled empty stub for'} ${slug}`);
    } else {
      console.log(`Skipped ${slug}: populated CMS content already exists.`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
