/**
 * WhatsApp floating-button helpers — normalise phone and build wa.me links.
 */

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

/**
 * Resolve WhatsApp FAB config from site settings.
 * Button shows only when enabled AND a usable international number is present.
 */
function resolveWhatsappConfig(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  try {
    const enabled = s.whatsapp_enabled === 'true';
    const numberRaw = String(s.whatsapp_number || '').trim();
    const phoneDigits = digitsOnly(numberRaw);
    const message = String(s.whatsapp_message || '').trim();
    const show = enabled && phoneDigits.length >= 8;

    let href = '';
    if (show) {
      href = `https://wa.me/${phoneDigits}`;
      if (message) {
        href += `?text=${encodeURIComponent(message)}`;
      }
    }

    return {
      enabled,
      show,
      numberRaw,
      phoneDigits,
      message,
      href,
    };
  } catch {
    return {
      enabled: false,
      show: false,
      numberRaw: '',
      phoneDigits: '',
      message: '',
      href: '',
    };
  }
}

module.exports = {
  digitsOnly,
  resolveWhatsappConfig,
};
