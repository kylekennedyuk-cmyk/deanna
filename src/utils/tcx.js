/**
 * 3CX Live Chat helpers — sanitise embed snippets and normalise config.
 *
 * Opening the chat: 3CX has no public JS API. The reliable approach is to
 * click #wplc-chat-button inside nested shadow roots:
 *   call-us-selector → shadow → call-us → shadow → #wplc-chat-button
 * See public/js/tcx-widget.js for retries + fallback slide-over.
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
    // Keep origin only (strip /webclient paths etc.) unless path is meaningful for Talk.
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
    // Fallback: look for URL-like tokens in the snippet text
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
  const enabled = settings.tcx_enabled === 'true';
  const snippet = String(settings.tcx_embed_snippet || '').trim();
  const parsed = parseTcxSnippet(snippet);

  let phonesystemUrl = normalisePhonesystemUrl(settings.tcx_phonesystem_url);
  let party = String(settings.tcx_party || '').trim();

  // If phonesystem field is a full party URL, extract party
  if (!party) {
    party = extractPartyFromUrl(settings.tcx_phonesystem_url);
  }

  // Prefer structured fields; fall back to snippet-extracted values
  if (!phonesystemUrl && parsed.phonesystemUrl) phonesystemUrl = parsed.phonesystemUrl;
  if (!party && parsed.party) party = parsed.party;

  const talkUrl = String(settings.tcx_talk_url || '').trim();
  const callNumber = String(settings.tcx_call_number || settings.phone || '').trim();
  const greeting =
    String(settings.tcx_greeting || '').trim() || 'Chat or call Destinations With Deanna';

  const hasChat = Boolean(phonesystemUrl && party);
  const hasCall = Boolean(talkUrl || callNumber);
  const show = enabled && (hasChat || hasCall || Boolean(snippet && parsed.rawSafe));

  return {
    enabled,
    show,
    hasChat,
    hasCall,
    phonesystemUrl,
    party,
    talkUrl,
    callNumber,
    greeting,
    callusScriptUrl: `https://downloads-global.3cx.com${CALLUS_SCRIPT_PATH}`,
  };
}

/** Safe HTML for the hidden 3CX embed (never echoes raw admin HTML). */
function renderTcxEmbedHtml(config) {
  if (!config.hasChat) return '';
  const url = String(config.phonesystemUrl).replace(/"/g, '');
  const party = String(config.party).replace(/"/g, '');
  return `<call-us-selector phonesystem-url="${url}" party="${party}"></call-us-selector>`;
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
