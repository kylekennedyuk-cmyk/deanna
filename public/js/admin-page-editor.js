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
    featureCards: 'One per line: Title | text | image URL | optional link | optional link label.',
    highlights: 'One per line: Title | text | image URL.',
    testimonials: 'One per line: Quote | name | trip detail.',
    timeline: 'One per line: Stage title | explanation.',
    faq: 'One per line: Question | answer.',
    tips: 'One tip per line.',
    hotelGrid: 'One per line: Hotel | price level | best for | description.',
    why: 'One per line: Card title | supporting text. Heading field becomes the section title.',
    process: 'One per line: Step title | supporting text. Heading field becomes the section title.',
    hero: 'Heading = headline. Main text = subheadline. Bullet points = benefit lines (one per line).',
    split: 'Line 1 of bullet/panel box = panel title. Line 2 = panel text. Extra lines = optional bullets.',
    cta: 'Heading, main text, and primary button fields only.',
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
      if (type === 'timeline' || type === 'why' || type === 'process') {
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
      if (type === 'featureCards' || type === 'highlights') {
        return cleanObject({
          title: parts[0],
          text: parts[1],
          image: parts[2],
          href: parts[3],
          label: parts.slice(4).join(' | '),
        });
      }
      if (type === 'testimonials') {
        return cleanObject({
          text: parts[0],
          title: parts[1],
          label: parts.slice(2).join(' | '),
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
    };

    const parsedRows = parseRows(type, values.rowsText);

    if (type === 'faq' || type === 'timeline') result.items = parsedRows;
    if (type === 'tips') result.items = parsedRows;
    if (type === 'hotelGrid') result.hotels = parsedRows;
    if (type === 'cards') result.cards = parsedRows;
    if (type === 'featureCards' || type === 'highlights') result.cards = parsedRows;
    if (type === 'testimonials') result.items = parsedRows;
    if (type === 'why') {
      result.title = values.heading;
      result.items = parsedRows;
    }
    if (type === 'process') {
      result.title = values.heading;
      result.steps = parsedRows;
    }
    if (type === 'split') {
      const pointLines = lines(values.pointsText);
      if (pointLines[0]) result.panelTitle = pointLines[0];
      if (pointLines[1]) result.panelText = pointLines[1];
      if (pointLines.length > 2) result.points = pointLines.slice(2);
    }
    if (type === 'hero') {
      result.headline = values.heading;
      result.subheadline = values.text;
      result.points = lines(values.pointsText);
      result.primaryCta = cleanObject({
        label: values.primaryLabel,
        href: values.primaryHref,
      });
      result.secondaryCta = cleanObject({
        label: values.secondaryLabel,
        href: values.secondaryHref,
      });
    }
    if (type === 'cta') {
      delete result.eyebrow;
      delete result.image;
      delete result.imageAlt;
      delete result.secondaryLabel;
      delete result.secondaryHref;
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
    if (typeInput) typeInput.value = type;

    const label = section.querySelector('.section-type-label');
    if (label) label.textContent = type;

    const helper = section.querySelector('.section-row-help');
    if (helper) helper.textContent = helpByType[type] || helpByType.cards;

    const pointsHelp = section.querySelector('.section-points-help');
    if (pointsHelp) {
      pointsHelp.textContent =
        type === 'split'
          ? 'Split: line 1 = panel title, line 2 = panel text.'
          : type === 'hero'
            ? 'Hero: one benefit bullet per line.'
            : 'Optional bullet points, one per line.';
    }
  }

  function bindSection(section) {
    updateSection(section);

    const typeInput = section.querySelector('[data-field="type"]');
    if (typeInput && !typeInput.dataset.bound) {
      typeInput.dataset.bound = '1';
      typeInput.addEventListener('change', () => updateSection(section));
    }

    const heading = section.querySelector('.section-heading');
    const title = section.querySelector('h3');
    if (heading && title && !heading.dataset.bound) {
      heading.dataset.bound = '1';
      heading.addEventListener('input', () => {
        title.textContent = heading.value.trim() || 'Untitled section';
      });
    }

    section.querySelector('.remove-section')?.addEventListener('click', () => {
      if (window.confirm('Remove this section from the page?')) section.remove();
    });

    section.querySelector('.duplicate-section')?.addEventListener('click', () => {
      const clone = section.cloneNode(true);
      clone.querySelectorAll('[data-bound]').forEach((el) => delete el.dataset.bound);
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

  typeSelect?.addEventListener('change', () => {
    const preview = document.getElementById('new-section-help');
    if (preview) preview.textContent = helpByType[typeSelect.value] || '';
  });

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
