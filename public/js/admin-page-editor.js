(() => {
  const form = document.getElementById('page-editor');
  const list = document.getElementById('section-list');
  const template = document.getElementById('section-template');
  const addButton = document.getElementById('add-section');
  const typeSelect = document.getElementById('new-section-type');
  const output = document.getElementById('sections-json');

  if (!form || !list || !template || !output) return;

  const helpByType = {
    cards: 'One per line: Title | text | optional link | optional link label.',
    timeline: 'One per line: Stage title | explanation.',
    faq: 'One per line: Question | answer.',
    tips: 'One tip per line. No separators needed.',
    hotelGrid: 'One per line: Hotel | price level | best for | description.',
    why: 'One per line: Card title | supporting text.',
    process: 'One per line: Step title | supporting text.',
    hero: 'Use the heading, text, image and button fields above.',
    split: 'Use heading, text, image and bullet-point fields.',
    cta: 'Use heading, text and button fields.',
  };

  function lines(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function cleanObject(object) {
    return Object.fromEntries(
      Object.entries(object).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== '' && value !== null && value !== undefined;
      })
    );
  }

  function parseRows(type, value) {
    const rowLines = lines(value);
    if (type === 'tips') return rowLines;

    return rowLines.map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      if (type === 'faq') {
        return cleanObject({ question: parts[0], answer: parts.slice(1).join(' | ') });
      }
      if (type === 'timeline') {
        return cleanObject({ title: parts[0], text: parts.slice(1).join(' | ') });
      }
      if (type === 'hotelGrid') {
        return cleanObject({
          name: parts[0],
          level: parts[1],
          bestFor: parts[2],
          description: parts.slice(3).join(' | '),
        });
      }
      return cleanObject({
        title: parts[0],
        text: parts[1],
        href: parts[2],
        label: parts.slice(3).join(' | '),
      });
    });
  }

  function serializeSection(section) {
    const values = {};
    section.querySelectorAll('[data-field]').forEach((input) => {
      values[input.dataset.field] = input.value.trim();
    });

    const type = values.type || section.dataset.sectionType || 'cards';
    const result = {
      type,
      eyebrow: values.eyebrow,
      heading: values.heading,
      text: values.text,
      image: values.image,
      imageAlt: values.imageAlt,
      primaryLabel: values.primaryLabel,
      primaryHref: values.primaryHref,
      secondaryLabel: values.secondaryLabel,
      secondaryHref: values.secondaryHref,
      points: lines(values.pointsText),
    };

    const parsedRows = parseRows(type, values.rowsText);
    if (type === 'faq' || type === 'timeline') result.items = parsedRows;
    if (type === 'tips') result.items = parsedRows;
    if (type === 'hotelGrid') result.hotels = parsedRows;
    if (type === 'cards') result.cards = parsedRows;
    if (type === 'why') {
      result.title = values.heading;
      result.items = parsedRows;
      delete result.heading;
    }
    if (type === 'process') {
      result.title = values.heading;
      result.steps = parsedRows;
      delete result.heading;
    }
    if (type === 'hero') {
      result.headline = values.heading;
      result.subheadline = values.text;
      result.primaryCta = cleanObject({
        label: values.primaryLabel,
        href: values.primaryHref,
      });
      result.secondaryCta = cleanObject({
        label: values.secondaryLabel,
        href: values.secondaryHref,
      });
    }

    return cleanObject(result);
  }

  function serialize() {
    output.value = JSON.stringify(
      [...list.querySelectorAll('.section-editor')].map(serializeSection)
    );
  }

  function updateSection(section) {
    const typeInput = section.querySelector('[data-field="type"]');
    const type = typeInput ? typeInput.value : section.dataset.sectionType;
    section.dataset.sectionType = type;

    const label = section.querySelector('.section-type-label');
    if (label) label.textContent = type;

    const helper = section.querySelector('.section-row-help');
    if (helper) helper.textContent = helpByType[type] || helpByType.cards;

    const heading = section.querySelector('.section-heading');
    const title = section.querySelector('h3');
    if (heading && title) {
      heading.addEventListener('input', () => {
        title.textContent = heading.value.trim() || 'Untitled section';
      });
    }
  }

  function bindSection(section) {
    updateSection(section);

    section.querySelector('.remove-section')?.addEventListener('click', () => {
      if (window.confirm('Remove this section from the page?')) section.remove();
    });

    section.querySelector('.duplicate-section')?.addEventListener('click', () => {
      const clone = section.cloneNode(true);
      section.after(clone);
      bindSection(clone);
      clone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    section.querySelector('.move-up')?.addEventListener('click', () => {
      const previous = section.previousElementSibling;
      if (previous) list.insertBefore(section, previous);
    });

    section.querySelector('.move-down')?.addEventListener('click', () => {
      const next = section.nextElementSibling;
      if (next) list.insertBefore(next, section);
    });
  }

  list.querySelectorAll('.section-editor').forEach(bindSection);

  addButton?.addEventListener('click', () => {
    const section = template.content.firstElementChild.cloneNode(true);
    const type = typeSelect?.value || 'cards';
    section.dataset.sectionType = type;
    section.querySelector('[data-field="type"]').value = type;
    list.append(section);
    bindSection(section);
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    section.querySelector('.section-heading')?.focus();
  });

  form.addEventListener('submit', serialize);
})();
