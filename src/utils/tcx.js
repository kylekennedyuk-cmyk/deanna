/**
 * 3CX Live Chat helpers — sanitise embed snippets and normalise config.
 * Public site embeds the official call-us-selector + callus.js only.
 */

const ALLOWED_SCRIPT_HOSTS = new Set([
  'downloads-global.3cx.com',
  'downloads.3cx.com',
]);

const CALLUS_SCRIPT_PATH = '/downloads/livechatandtalk/v1/callus.js';

function attr(source, name) {
  if (!source) return '';
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = String(source).match(re);
  return match ? match[1].trim() : '';
}

function normalisePhonesystemUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function extractPartyFromUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const party = url.searchParams.get('party') || '';
    if (party) return party.trim();
    const hash = url.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash.includes('=') ? hash : '');
    return (hashParams.get('party') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Parse a pasted 3CX embed snippet into safe structured fields.
 * Never trusts arbitrary HTML — only extracts known attributes / CDN script.
 */
function parseTcxSnippet(snippet) {
  const html = String(snippet || '');
  if (!html.trim()) {
    return { phonesystemUrl: '', party: '', hasAllowedScript: false, rawSafe: false };
  }

  const selectorAttrs = (html.match(/<call-us-selector\b([^>]*)>/i) || [])[1] || '';
  const callUsAttrs = (html.match(/<call-us\b([^>]*)>/i) || [])[1] || '';
  const attrs = selectorAttrs || callUsAttrs;

  let phonesystemUrl = normalisePhonesystemUrl(attr(attrs, 'phonesystem-url'));
  let party = attr(attrs, 'party');

  if (!phonesystemUrl || !party) {
    const urlMatch = html.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch && !phonesystemUrl) {
      phonesystemUrl = normalisePhonesystemUrl(urlMatch[0]);
      if (!party) party = extractPartyFromUrl(urlMatch[0]);
    }
  }

  const scriptMatch = html.match(/<script\b([^>]*)>/i);
  const scriptAttrs = scriptMatch ? scriptMatch[1] : '';
  const scriptSrc = attr(scriptAttrs, 'src');
  let hasAllowedScript = false;
  if (scriptSrc) {
    try {
      const srcUrl = new URL(scriptSrc);
      hasAllowedScript =
        ALLOWED_SCRIPT_HOSTS.has(srcUrl.hostname) &&
        srcUrl.pathname.replace(/\/+$/, '') === CALLUS_SCRIPT_PATH.replace(/\/+$/, '');
    } catch {
      hasAllowedScript = false;
    }
  }

  return {
    phonesystemUrl,
    party,
    hasAllowedScript,
    rawSafe: Boolean(phonesystemUrl && party),
  };
}

function resolveTcxConfig(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  // 3CX is force-disabled on the public site — WhatsApp FAB is the preferred chat CTA.
  // Settings fields remain for possible future re-enable; show is always false.
  try {
    const snippet = String(s.tcx_embed_snippet || '').trim();
    const parsed = parseTcxSnippet(snippet);

    let phonesystemUrl = normalisePhonesystemUrl(s.tcx_phonesystem_url);
    let party = String(s.tcx_party || '').trim();

    if (!party) {
      party = extractPartyFromUrl(s.tcx_phonesystem_url);
    }

    if (!phonesystemUrl && parsed.phonesystemUrl) phonesystemUrl = parsed.phonesystemUrl;
    if (!party && parsed.party) party = parsed.party;

    const callNumber = String(s.tcx_call_number || s.phone || '').trim();
    const hasChat = Boolean(phonesystemUrl && party);

    return {
      enabled: false,
      show: false,
      hasChat,
      phonesystemUrl,
      party,
      callNumber,
      callusScriptUrl: `https://downloads-global.3cx.com${CALLUS_SCRIPT_PATH}`,
    };
  } catch {
    return {
      enabled: false,
      show: false,
      hasChat: false,
      phonesystemUrl: '',
      party: '',
      callNumber: '',
      callusScriptUrl: `https://downloads-global.3cx.com${CALLUS_SCRIPT_PATH}`,
    };
  }
}

/** Safe HTML for the official 3CX embed (never echoes raw admin HTML). */
function renderTcxEmbedHtml(config) {
  if (!config || typeof config !== 'object' || !config.hasChat) return '';
  try {
    const url = String(config.phonesystemUrl || '').replace(/"/g, '');
    const party = String(config.party || '').replace(/"/g, '');
    if (!url || !party) return '';
    return `<call-us-selector phonesystem-url="${url}" party="${party}"></call-us-selector>`;
  } catch {
    return '';
  }
}

module.exports = {
  ALLOWED_SCRIPT_HOSTS,
  CALLUS_SCRIPT_PATH,
  extractPartyFromUrl,
  normalisePhonesystemUrl,
  parseTcxSnippet,
  renderTcxEmbedHtml,
  resolveTcxConfig,
};
