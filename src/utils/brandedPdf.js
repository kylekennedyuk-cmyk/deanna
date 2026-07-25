const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const { getSettings } = require('../config/settings');
const {
  formatDateTime,
  formatMoney,
  planTitle,
  preferenceEntries,
  statusLabel,
  stripMarginNotes,
} = require('./format');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// Mirrors the branded email palette in src/config/email.js.
const CREAM = '#fbf8f3';
const INK = '#1a2b40';
const MUTED = '#3d5b79';
const RULE = '#e4ebf3';
const TINT = '#f3f6fa';
const FALLBACK_PRIMARY = '#1a2b40';
const FALLBACK_SECONDARY = '#d1a24a';

// pdfkit ships Times (Georgia-like serif) and Helvetica (Arial-like) — same
// serif-heading / sans-body pairing the emails use.
const SERIF = 'Times-Bold';
const SANS = 'Helvetica';
const SANS_BOLD = 'Helvetica-Bold';

const PAGE_MARGINS = { top: 50, bottom: 92, left: 50, right: 50 };

const DOC_TYPES = {
  confirmation: {
    title: 'Booking confirmation',
    slug: 'booking-confirmation',
    intro: 'Everything is booked and confirmed. Keep this with your travel documents.',
  },
  itinerary: {
    title: 'Your itinerary',
    slug: 'itinerary',
    intro: 'Your day-by-day plan, flights and hotel in one place.',
  },
  plan: {
    title: 'Holiday plan',
    slug: 'holiday',
    intro: 'A full summary of the holiday Deanna has put together for you.',
  },
};

function documentType(type) {
  return DOC_TYPES[String(type || '').toLowerCase()] ? String(type).toLowerCase() : 'plan';
}

function normalizeHex(value, fallback) {
  const hex = String(value || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : fallback;
}

/**
 * pdfkit can only embed local PNG/JPEG files, so resolve the configured logo to
 * a path inside /public and ignore remote or SVG logos (the wordmark is used
 * instead, exactly as the emails fall back).
 */
function resolveLogoPath(logoUrl, appUrl) {
  let url = String(logoUrl || '').trim();
  if (!url) return null;

  if (/^https?:\/\//i.test(url)) {
    const origin = String(appUrl || '').replace(/\/+$/, '');
    if (origin && url.startsWith(origin)) url = url.slice(origin.length);
    else return null;
  }

  const relative = url.split('?')[0].replace(/^\/+/, '');
  if (!/\.(png|jpe?g)$/i.test(relative)) return null;

  const resolved = path.resolve(PUBLIC_DIR, relative);
  if (!resolved.startsWith(PUBLIC_DIR)) return null;
  return fs.existsSync(resolved) ? resolved : null;
}

async function resolveBrand() {
  const settings = await getSettings();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return {
    siteName: settings.site_name || 'Destinations With Deanna',
    tagline: settings.site_tagline || '',
    primary: normalizeHex(settings.primary_colour, FALLBACK_PRIMARY),
    secondary: normalizeHex(settings.secondary_colour, FALLBACK_SECONDARY),
    supportEmail: settings.support_email || '',
    phone: settings.phone || '',
    address: settings.address || '',
    abtaNumber: settings.abta_number || '',
    atolNumber: settings.atol_number || '',
    logoPath: resolveLogoPath(settings.logo_url, appUrl),
    appUrl,
  };
}

function safeJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, needed) {
  const limit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > limit) doc.addPage();
}

function drawHeader(doc, brand, { heading, subtitle, intro }) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const bandHeight = 122;

  doc.rect(0, 0, doc.page.width, bandHeight).fill(CREAM);

  let logoDrawn = false;
  if (brand.logoPath) {
    try {
      doc.image(brand.logoPath, left, 32, { fit: [190, 58], align: 'center' });
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    doc
      .font(SERIF)
      .fontSize(24)
      .fillColor(brand.primary)
      .text(brand.siteName, left, 44, { width, align: 'center' });
  }

  if (brand.tagline) {
    doc
      .font(SANS)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(brand.tagline.toUpperCase(), left, 96, {
        width,
        align: 'center',
        characterSpacing: 1.1,
      });
  }

  doc.rect(0, bandHeight, doc.page.width, 3).fill(brand.secondary);

  doc.y = bandHeight + 30;
  doc.font(SERIF).fontSize(26).fillColor(brand.primary).text(heading, left, doc.y, { width });
  doc
    .font(SANS)
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(subtitle, left, doc.y + 4, { width, characterSpacing: 0.4 });

  if (intro) {
    doc
      .font(SANS)
      .fontSize(10.5)
      .fillColor(MUTED)
      .text(intro, left, doc.y + 10, { width, lineGap: 3 });
  }
  doc.y += 6;
}

function sectionHeading(doc, brand, label) {
  const left = doc.page.margins.left;
  doc.y += 18;
  // Reserve the heading, its rule and two body lines so a heading never sits
  // alone at the foot of a page.
  ensureSpace(doc, 78);
  doc
    .font(SERIF)
    .fontSize(14)
    .fillColor(brand.primary)
    .text(label.toUpperCase(), left, doc.y, { width: contentWidth(doc), characterSpacing: 1.2 });
  const ruleY = doc.y + 5;
  doc
    .moveTo(left, ruleY)
    .lineTo(left + 64, ruleY)
    .lineWidth(2.5)
    .strokeColor(brand.secondary)
    .stroke();
  doc.y = ruleY + 12;
}

function paragraph(doc, text) {
  const left = doc.page.margins.left;
  ensureSpace(doc, 30);
  doc
    .font(SANS)
    .fontSize(10.5)
    .fillColor(INK)
    .text(String(text || '').trim(), left, doc.y, { width: contentWidth(doc), lineGap: 3.5 });
}

function keyValueRows(doc, rows) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const labelWidth = 148;
  const valueWidth = width - labelWidth - 20;

  rows
    .filter((row) => row && String(row.value || '').trim())
    .forEach((row, index) => {
      const value = String(row.value).trim();
      const valueHeight = doc.font(SANS_BOLD).fontSize(10).heightOfString(value, {
        width: valueWidth,
        lineGap: 2,
      });
      const rowHeight = Math.max(valueHeight, 12) + 12;
      ensureSpace(doc, rowHeight + 4);

      const top = doc.y;
      if (index % 2 === 0) doc.rect(left, top, width, rowHeight).fill(TINT);

      doc
        .font(SANS)
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(row.label, left + 10, top + 6, { width: labelWidth - 14 });
      doc
        .font(SANS_BOLD)
        .fontSize(10)
        .fillColor(INK)
        .text(value, left + labelWidth, top + 5, { width: valueWidth, lineGap: 2 });

      doc.y = top + rowHeight;
    });
}

function callout(doc, brand, { label, value, note }) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const inner = width - 44;

  const valueHeight = doc.font(SERIF).fontSize(20).heightOfString(String(value), { width: inner });
  const noteHeight = note
    ? doc.font(SANS).fontSize(9.5).heightOfString(note, { width: inner, lineGap: 2 })
    : 0;
  const boxHeight = 26 + valueHeight + (noteHeight ? noteHeight + 8 : 0) + 20;

  ensureSpace(doc, boxHeight + 10);
  const top = doc.y;

  doc.roundedRect(left, top, width, boxHeight, 12).fill(CREAM);
  doc.roundedRect(left + 0.75, top + 0.75, width - 1.5, boxHeight - 1.5, 12)
    .lineWidth(1.5)
    .strokeColor(brand.secondary)
    .stroke();

  doc
    .font(SANS)
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(String(label).toUpperCase(), left + 22, top + 14, { width: inner, characterSpacing: 1.2 });
  doc
    .font(SERIF)
    .fontSize(20)
    .fillColor(brand.primary)
    .text(String(value), left + 22, top + 28, { width: inner });
  if (note) {
    doc
      .font(SANS)
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(note, left + 22, top + 34 + valueHeight, { width: inner, lineGap: 2 });
  }

  doc.y = top + boxHeight;
}

function textSection(doc, brand, label, body, fallback) {
  const content = String(body || '').trim();
  if (!content && !fallback) return;
  sectionHeading(doc, brand, label);
  paragraph(doc, content || fallback);
}

function trustLine(brand) {
  const marks = [];
  if (brand.abtaNumber) marks.push(`ABTA member ${brand.abtaNumber}`);
  if (brand.atolNumber) marks.push(`ATOL licence ${brand.atolNumber}`);
  return marks.length ? `Travel protection: ${marks.join(' · ')}` : '';
}

function drawFooters(doc, brand) {
  const range = doc.bufferedPageRange();
  const contactBits = [brand.siteName, brand.supportEmail, brand.phone, brand.address].filter(
    Boolean
  );
  const lines = [contactBits.join(' · '), trustLine(brand)].filter(Boolean);

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Footer sits inside the bottom margin, so drop the margin while drawing to
    // stop pdfkit from spilling onto a fresh page.
    const original = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    const ruleY = doc.page.height - 62;

    doc.moveTo(left, ruleY).lineTo(left + width, ruleY).lineWidth(0.8).strokeColor(RULE).stroke();
    doc
      .font(SANS)
      .fontSize(8)
      .fillColor(MUTED)
      .text(lines.join('\n'), left, ruleY + 9, { width: width - 70, lineGap: 2.5 });
    doc
      .font(SANS)
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Page ${index + 1} of ${range.count}`, left, ruleY + 9, { width, align: 'right' });

    doc.page.margins.bottom = original;
  }
}

function bookingRows(plan) {
  return [
    { label: 'Booking status', value: statusLabel(plan.status) },
    { label: 'Booked on', value: plan.bookedAt ? formatDateTime(plan.bookedAt) : '' },
    { label: 'Confirmed on', value: plan.confirmedAt ? formatDateTime(plan.confirmedAt) : '' },
  ];
}

function tripRows(plan) {
  return [
    { label: 'Traveller', value: plan.customer ? plan.customer.name : '' },
    { label: 'Travel dates', value: plan.travelDates },
    { label: 'Party size', value: `${plan.partySize} ${plan.partySize === 1 ? 'traveller' : 'travellers'}` },
    { label: 'Budget guide', value: formatMoney(plan.budget) },
    { label: 'Plan reference', value: `Plan #${plan.id}` },
    { label: 'Last updated', value: formatDateTime(plan.updatedAt) },
  ];
}

function renderPlanDocument(doc, { plan, brand, type, forAgent }) {
  const kind = documentType(type);
  const meta = DOC_TYPES[kind];
  const preferences = safeJson(plan.preferences);
  const customerPricing = stripMarginNotes(plan.pricing);
  const hasBooking = Boolean(plan.bookingReference || plan.confirmationDetails || plan.bookedAt);

  const subtitleBits = [
    planTitle(plan, preferences),
    plan.customer ? `Prepared for ${plan.customer.name}` : '',
    `Issued ${formatDateTime(new Date())}`,
  ].filter(Boolean);

  drawHeader(doc, brand, {
    heading: meta.title,
    subtitle: subtitleBits.join('  ·  '),
    intro: kind === 'confirmation' && !hasBooking ? DOC_TYPES.plan.intro : meta.intro,
  });

  if (kind === 'confirmation' && plan.bookingReference) {
    doc.y += 8;
    callout(doc, brand, {
      label: 'Booking reference',
      value: plan.bookingReference,
      note: 'Quote this reference in any message, email or phone call about your holiday.',
    });
  }

  sectionHeading(doc, brand, 'Trip summary');
  keyValueRows(doc, [...tripRows(plan), ...(hasBooking ? bookingRows(plan) : [])]);

  if (hasBooking && kind !== 'itinerary') {
    sectionHeading(doc, brand, 'Booking confirmation');
    if (plan.bookingReference && kind !== 'confirmation') {
      keyValueRows(doc, [{ label: 'Booking reference', value: plan.bookingReference }]);
    }
    paragraph(
      doc,
      plan.confirmationDetails ||
        'Your booking is held with the supplier. Deanna will add payment and ticket details here as soon as they are issued.'
    );
  }

  if (kind === 'plan') {
    const prefs = preferenceEntries(preferences);
    if (prefs.length) {
      sectionHeading(doc, brand, 'Your preferences');
      keyValueRows(
        doc,
        prefs.map((entry) => ({ label: entry.label, value: entry.value }))
      );
    }
  }

  textSection(doc, brand, 'Flights', plan.flights, kind === 'plan' ? 'To be confirmed.' : '');
  textSection(doc, brand, 'Hotel', plan.hotel, kind === 'plan' ? 'To be confirmed.' : '');
  const itineraryFallback =
    kind === 'itinerary'
      ? 'Your day-by-day pacing plan is still being prepared.'
      : kind === 'plan'
        ? 'To be confirmed.'
        : '';
  textSection(doc, brand, 'Itinerary', plan.itinerary, itineraryFallback);

  if (kind !== 'itinerary') {
    textSection(doc, brand, 'Pricing', customerPricing, kind === 'plan' ? 'To be confirmed.' : '');
  }

  if (forAgent && plan.notes) {
    sectionHeading(doc, brand, 'Internal notes (agent copy)');
    paragraph(doc, plan.notes);
  }

  sectionHeading(doc, brand, 'Any questions?');
  const contact = [
    brand.supportEmail ? `Email ${brand.supportEmail}` : '',
    brand.phone ? `Call ${brand.phone}` : '',
    `Message Deanna in your portal: ${brand.appUrl}/customer/plans/${plan.id}/messages`,
  ].filter(Boolean);
  paragraph(doc, contact.join('\n'));
}

function pdfFilename(plan, type) {
  const kind = documentType(type);
  return `${DOC_TYPES[kind].slug}-plan-${plan.id}.pdf`;
}

/**
 * Stream a branded plan PDF straight to the response — nothing is written to
 * disk, so Passenger/Plesk needs no writable document store.
 */
async function streamPlanPdf(res, { plan, type = 'plan', forAgent = false }) {
  const brand = await resolveBrand();
  const kind = documentType(type);
  const filename = pdfFilename(plan, kind);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { ...PAGE_MARGINS },
    bufferPages: true,
    info: {
      Title: `${DOC_TYPES[kind].title} — Plan #${plan.id}`,
      Author: brand.siteName,
      Subject: `${brand.siteName} · Plan #${plan.id}`,
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  renderPlanDocument(doc, { plan, brand, type: kind, forAgent });
  drawFooters(doc, brand);
  doc.end();
}

module.exports = {
  DOC_TYPES,
  documentType,
  pdfFilename,
  resolveBrand,
  resolveLogoPath,
  streamPlanPdf,
};
