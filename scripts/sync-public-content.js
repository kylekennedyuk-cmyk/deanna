require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { pages } = require('../src/content/publicPages');

const prisma = new PrismaClient();

async function main() {
  for (const [slug, page] of Object.entries(pages)) {
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
    console.log(`Updated ${slug}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
