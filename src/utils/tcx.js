/**
 * 3CX Live Chat helpers — sanitise embed snippets and normalise config.
 *
 * Opening chat/call: 3CX has no public JS API. Click controls inside nested
 * shadow roots (call-us-selector → call-us → #wplc-chat-button / #callUsCallBtn).
 * See public/js/tcx-widget.js.
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

/** True for 3CX Meetings / Meet join links (not Live Chat & Talk VoIP). */
function isMeetingsUrl(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return false;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const path = `${url.hostname}${url.pathname}`;
    return (
      /\/meet(\/|$)/i.test(url.pathname) ||
      /\/join\//i.test(url.pathname) ||
      /meetings?\.3cx/i.test(path) ||
      /\/webmeeting/i.test(url.pathname)
    );
  } catch {
    return /meet|\/join\//i.test(value);
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
  // Null-safe: middleware / tests may pass undefined before settings load.
  const s = settings && typeof settings === 'object' ? settings : {};
  try {
    const enabled = s.tcx_enabled === 'true';
    const snippet = String(s.tcx_embed_snippet || '').trim();
    const parsed = parseTcxSnippet(snippet);

    let phonesystemUrl = normalisePhonesystemUrl(s.tcx_phonesystem_url);
    let party = String(s.tcx_party || '').trim();

    // If phonesystem field is a full party URL, extract party
    if (!party) {
      party = extractPartyFromUrl(s.tcx_phonesystem_url);
    }

    // Prefer structured fields; fall back to snippet-extracted values
    if (!phonesystemUrl && parsed.phonesystemUrl) phonesystemUrl = parsed.phonesystemUrl;
    if (!party && parsed.party) party = parsed.party;

    const rawTalkUrl = String(s.tcx_talk_url || '').trim();
    const talkIsMeetings = isMeetingsUrl(rawTalkUrl);
    // Only keep Talk URL when it is not a Meetings/Meet join link
    const talkUrl = talkIsMeetings ? '' : rawTalkUrl;

    const callNumber = String(s.tcx_call_number || s.phone || '').trim();
    const greeting =
      String(s.tcx_greeting || '').trim() || 'Chat or call Destinations With Deanna';

    const hasChat = Boolean(phonesystemUrl && party);
    // Browser VoIP comes from the Live Chat & Talk widget when chat is configured
    const hasBrowserCall = hasChat || Boolean(talkUrl);
    const hasCall = Boolean(hasBrowserCall || callNumber);
    const show = enabled && (hasChat || hasCall || Boolean(snippet && parsed.rawSafe));

    return {
      enabled,
      show,
      hasChat,
      hasCall,
      hasBrowserCall,
      phonesystemUrl,
      party,
      talkUrl,
      talkIsMeetings,
      callNumber,
      greeting,
      callusScriptUrl: `https://downloads-global.3cx.com${CALLUS_SCRIPT_PATH}`,
      brandPrimary: String(s.primary_colour || '#1a2b40').trim() || '#1a2b40',
      brandSecondary: String(s.secondary_colour || '#d1a24a').trim() || '#d1a24a',
      brandBg: String(s.background_colour || '#fbf8f3').trim() || '#fbf8f3',
      logoUrl: String(s.logo_url || '').trim(),
    };
  } catch {
    return {
      enabled: false,
      show: false,
      hasChat: false,
      hasCall: false,
      hasBrowserCall: false,
      phonesystemUrl: '',
      party: '',
      talkUrl: '',
      talkIsMeetings: false,
      callNumber: '',
      greeting: 'Chat or call Destinations With Deanna',
      callusScriptUrl: `https://downloads-global.3cx.com${CALLUS_SCRIPT_PATH}`,
      brandPrimary: '#1a2b40',
      brandSecondary: '#d1a24a',
      brandBg: '#fbf8f3',
      logoUrl: '',
    };
  }
}

/** Safe HTML for the 3CX embed (never echoes raw admin HTML). */
function renderTcxEmbedHtml(config) {
  if (!config || typeof config !== 'object' || !config.hasChat) return '';
  try {
    const url = String(config.phonesystemUrl || '').replace(/"/g, '');
    const party = String(config.party || '').replace(/"/g, '');
    if (!url || !party) return '';
    const primary = String(config.brandPrimary || '#1a2b40').replace(/"/g, '');
    const secondary = String(config.brandSecondary || '#d1a24a').replace(/"/g, '');
    const bg = String(config.brandBg || '#fbf8f3').replace(/"/g, '');
    // Style attributes hint brand colours; JS also injects shadow CSS after mount.
    return (
      `<call-us-selector phonesystem-url="${url}" party="${party}" ` +
      `style="--call-us-main-accent-color:${secondary};--call-us-main-background-color:${bg};` +
      `--call-us-plate-background-color:${primary};--call-us-plate-font-color:#ffffff;` +
      `--call-us-main-font-color:${primary};"></call-us-selector>`
    );
  } catch {
    return '';
  }
}

module.exports = {
  ALLOWED_SCRIPT_HOSTS,
  CALLUS_SCRIPT_PATH,
  extractPartyFromUrl,
  isMeetingsUrl,
  normalisePhonesystemUrl,
  parseTcxSnippet,
  renderTcxEmbedHtml,
  resolveTcxConfig,
};
