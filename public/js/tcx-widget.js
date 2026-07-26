/**
 * Branded 3CX floating widget.
 *
 * Live chat: wait for nested shadow DOM #wplc-chat-button, unhide chrome enough
 * to click, open chat, leave expanded UI visible (never re-hide the plate).
 *
 * Call in browser: open the widget then click #callUsCallBtn / #callBtn (WebRTC).
 * Meetings/Meet URLs are not used as the primary browser-call path.
 *
 * Branding: inject CSS into open shadow roots using site --brand-* colours / logo.
 */
(() => {
  const root = document.querySelector('[data-tcx-widget]');
  if (!root) return;

  const toggle = root.querySelector('[data-tcx-toggle]');
  const panel = root.querySelector('[data-tcx-panel]');
  const closeBtn = root.querySelector('[data-tcx-close]');
  const liveChatBtn = root.querySelector('[data-tcx-live-chat]');
  const talkBtn = root.querySelector('[data-tcx-talk]');
  const statusEl = root.querySelector('[data-tcx-status]');
  const phonesystemUrl = root.dataset.phonesystemUrl || '';
  const party = root.dataset.party || '';
  const talkUrl = root.dataset.talkUrl || '';
  const logoUrl = root.dataset.logoUrl || '';
  const hasChat = root.dataset.hasChat === 'true';
  const brand = {
    primary: root.dataset.brandPrimary || '#1a2b40',
    secondary: root.dataset.brandSecondary || '#d1a24a',
    bg: root.dataset.brandBg || '#fbf8f3',
  };

  let lastFocus = null;
  let opening = false;
  let nativeBubbleVisible = false;
  let brandApplied = false;

  const BRAND_STYLE_ID = 'tcx-brand-shadow-style';

  function focusableIn(el) {
    return [...el.querySelectorAll('a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')].filter(
      (node) => !node.hasAttribute('hidden') && node.offsetParent !== null
    );
  }

  function setOpen(open) {
    if (!panel || !toggle) return;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('is-open', open);
    if (open) {
      lastFocus = document.activeElement;
      const first = focusableIn(panel)[0] || closeBtn;
      if (first) first.focus();
    } else if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
  }

  function setStatus(message) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = Boolean(busy);
    if (label) btn.textContent = label;
  }

  function getCallUsHost() {
    const selector = document.querySelector('call-us-selector');
    if (selector?.shadowRoot) {
      const inner =
        selector.shadowRoot.querySelector('call-us') ||
        selector.shadowRoot.querySelector('call-us-phone');
      if (inner) return { selector, callUs: inner };
    }
    const direct =
      document.querySelector('call-us') || document.querySelector('call-us-phone');
    if (direct) return { selector: null, callUs: direct };
    return null;
  }

  function queryInShadows(rootEl, selector) {
    if (!rootEl) return null;
    if (rootEl.shadowRoot) {
      const hit = rootEl.shadowRoot.querySelector(selector);
      if (hit) return hit;
      for (const el of rootEl.shadowRoot.querySelectorAll('*')) {
        const nested = queryInShadows(el, selector);
        if (nested) return nested;
      }
    }
    return null;
  }

  function findChatButton() {
    const host = getCallUsHost();
    if (!host?.callUs?.shadowRoot) return null;
    return (
      host.callUs.shadowRoot.getElementById('wplc-chat-button') ||
      host.callUs.shadowRoot.querySelector('#wplc-chat-button')
    );
  }

  function findCallButtons() {
    const host = getCallUsHost();
    if (!host?.callUs) return [];
    const ids = ['callUsCallBtn', 'callBtn'];
    const found = [];
    for (const id of ids) {
      const el =
        host.callUs.shadowRoot?.getElementById(id) ||
        queryInShadows(host.callUs, `#${id}`);
      if (el) found.push(el);
    }
    // Intro "Call" action option (div with makeCall)
    const makeCallOption =
      host.callUs.shadowRoot?.querySelector('[ref="makeCallOption"], .action_option:not(.disabled\\:)') ||
      queryInShadows(host.callUs, '.action_option');
    if (makeCallOption && /call/i.test(makeCallOption.textContent || '')) {
      found.push(makeCallOption);
    }
    return found;
  }

  function findExpandedPlate() {
    const host = getCallUsHost();
    if (!host?.callUs?.shadowRoot) return null;
    return (
      host.callUs.shadowRoot.getElementById('wp-live-chat-by-3CX') ||
      host.callUs.shadowRoot.querySelector('#wp-live-chat-by-3CX, #callus-container, #callus-phone-container')
    );
  }

  function isChatExpanded() {
    const plate = findExpandedPlate();
    if (!plate) return false;
    const style = window.getComputedStyle(plate);
    const rect = plate.getBoundingClientRect();
    // Expanded plate is much larger than the minimized bubble
    return (
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0' &&
      (rect.width > 120 || rect.height > 120)
    );
  }

  function clearImportant(el, props) {
    if (!el?.style) return;
    for (const prop of props) {
      el.style.removeProperty(prop);
    }
  }

  function applyHideToMinimizedBubble(btn) {
    if (!btn || nativeBubbleVisible) return;
    if (isChatExpanded()) return;
    btn.style.setProperty('opacity', '0', 'important');
    btn.style.setProperty('visibility', 'hidden', 'important');
    btn.style.setProperty('pointer-events', 'none', 'important');
    btn.style.setProperty('width', '1px', 'important');
    btn.style.setProperty('height', '1px', 'important');
    btn.setAttribute('aria-hidden', 'true');
    btn.setAttribute('data-tcx-hidden', '1');
  }

  function revealBubbleForClick(btn) {
    if (!btn) return;
    clearImportant(btn, [
      'opacity',
      'visibility',
      'pointer-events',
      'width',
      'height',
      'position',
      'right',
      'bottom',
      'left',
      'top',
      'z-index',
    ]);
    btn.style.opacity = '0';
    btn.style.visibility = 'visible';
    btn.style.pointerEvents = 'auto';
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('data-tcx-hidden');
  }

  function unhideNativeBubblePermanently() {
    nativeBubbleVisible = true;
    document.documentElement.classList.add('tcx-native-bubble-visible');
    const btn = findChatButton();
    if (btn) {
      clearImportant(btn, [
        'opacity',
        'visibility',
        'pointer-events',
        'width',
        'height',
      ]);
      btn.removeAttribute('aria-hidden');
      btn.removeAttribute('data-tcx-hidden');
    }
    const plate = findExpandedPlate();
    if (plate) {
      clearImportant(plate, ['opacity', 'visibility', 'pointer-events', 'z-index']);
      plate.style.setProperty('z-index', '100000', 'important');
    }
  }

  function hideDefaultBubble() {
    if (nativeBubbleVisible || isChatExpanded()) return;
    const btn = findChatButton();
    if (btn) applyHideToMinimizedBubble(btn);
  }

  function brandStyleCss() {
    const logoRule = logoUrl
      ? `
      #wp-live-chat-by-3CX .header,
      #wp-live-chat-by-3CX [class*="header"],
      #callus-container .header,
      .box_header,
      .tcx-header,
      [class*="form-header"],
      [class*="panel-header"] {
        background-image: url("${logoUrl.replace(/"/g, '')}") !important;
        background-repeat: no-repeat !important;
        background-position: 12px center !important;
        background-size: auto 28px !important;
        padding-left: 3.25rem !important;
      }`
      : '';

    return `
      :host, #wp-live-chat-by-3CX, #callus-container, #callus-phone-container, .root {
        --call-us-main-accent-color: ${brand.secondary} !important;
        --call-us-main-background-color: ${brand.bg} !important;
        --call-us-plate-background-color: ${brand.primary} !important;
        --call-us-plate-font-color: #ffffff !important;
        --call-us-main-font-color: ${brand.primary} !important;
        --call-us-agent-bubble-color: ${brand.primary}1a !important;
        --call-us-form-header-background: ${brand.primary} !important;
        --call-us-main-button-background: ${brand.primary} !important;
        --call-us-border-color: ${brand.secondary} !important;
        font-family: Outfit, "Segoe UI", sans-serif !important;
        z-index: 100000 !important;
      }
      #wp-live-chat-by-3CX, #callus-container, #callus-phone-container {
        font-family: Outfit, "Segoe UI", sans-serif !important;
      }
      button, .button, [class*="submit"], [class*="main-button"], .call-us, .cw-panel-button {
        font-family: Outfit, "Segoe UI", sans-serif !important;
      }
      .box_header, [class*="form-header"], [class*="panel-header"], [class*="Header"] {
        background-color: ${brand.primary} !important;
        color: #fff !important;
        font-family: Fraunces, Georgia, serif !important;
      }
      a, .link {
        color: ${brand.primary} !important;
      }
      ${logoRule}
    `;
  }

  function injectBrandIntoShadow(shadowRoot) {
    if (!shadowRoot) return;
    let style = shadowRoot.getElementById(BRAND_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = BRAND_STYLE_ID;
      shadowRoot.appendChild(style);
    }
    style.textContent = brandStyleCss();
  }

  function applyBrandTheme() {
    const host = getCallUsHost();
    if (!host?.callUs) return false;

    const cssVars = {
      '--call-us-main-accent-color': brand.secondary,
      '--call-us-main-background-color': brand.bg,
      '--call-us-plate-background-color': brand.primary,
      '--call-us-plate-font-color': '#ffffff',
      '--call-us-main-font-color': brand.primary,
      '--call-us-agent-bubble-color': `${brand.primary}1a`,
    };

    const targets = [host.selector, host.callUs, findExpandedPlate()].filter(Boolean);
    for (const el of targets) {
      for (const [k, v] of Object.entries(cssVars)) {
        el.style.setProperty(k, v);
      }
    }

    if (host.selector?.shadowRoot) injectBrandIntoShadow(host.selector.shadowRoot);
    if (host.callUs.shadowRoot) injectBrandIntoShadow(host.callUs.shadowRoot);

    // Nested shadows (calling windows etc.)
    if (host.callUs.shadowRoot) {
      host.callUs.shadowRoot.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) injectBrandIntoShadow(el.shadowRoot);
      });
    }

    brandApplied = true;
    return true;
  }

  function ensureCallusLoaded() {
    if (document.querySelector('call-us-selector, call-us, call-us-phone')) return;
    if (document.getElementById('tcx-callus-js')) return;
    if (!phonesystemUrl || !party) return;
    const host = root.querySelector('[data-tcx-embed]');
    if (host && !host.querySelector('call-us-selector')) {
      const el = document.createElement('call-us-selector');
      el.setAttribute('phonesystem-url', phonesystemUrl);
      el.setAttribute('party', party);
      host.appendChild(el);
    }
    const script = document.createElement('script');
    script.id = 'tcx-callus-js';
    script.defer = true;
    script.charset = 'utf-8';
    script.src = 'https://downloads-global.3cx.com/downloads/livechatandtalk/v1/callus.js';
    document.body.appendChild(script);
  }

  function waitFor(predicate, { timeoutMs = 3000, intervalMs = 150 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const value = predicate();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        window.setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function clickEnabled(el) {
    if (!el) return false;
    if (el.disabled || el.getAttribute('disabled') != null) return false;
    if (el.classList?.contains('disabled:') || el.classList?.contains('disabled')) return false;
    el.click();
    return true;
  }

  async function openChatViaBubble() {
    ensureCallusLoaded();
    applyBrandTheme();

    const btn = await waitFor(() => {
      applyBrandTheme();
      const b = findChatButton();
      if (b) {
        // Keep minimized chrome hidden until we need to click; still track mount
        hideDefaultBubble();
      }
      return b;
    }, { timeoutMs: 3000, intervalMs: 150 });

    if (!btn) return { ok: false, reason: 'missing-button' };
    if (btn.disabled || btn.getAttribute('disabled') != null) {
      return { ok: false, reason: 'disabled-button', btn };
    }

    revealBubbleForClick(btn);
    applyBrandTheme();

    // Clear hide on plate so expanded UI can show
    const plate = findExpandedPlate();
    if (plate) {
      clearImportant(plate, ['opacity', 'visibility', 'pointer-events', 'width', 'height']);
      plate.style.setProperty('z-index', '100000', 'important');
    }

    if (!clickEnabled(btn)) return { ok: false, reason: 'click-failed', btn };

    const opened = await waitFor(() => isChatExpanded(), { timeoutMs: 500, intervalMs: 50 });
    if (opened) {
      applyBrandTheme();
      // Re-hide only the minimized bubble chrome if it still exists separately
      // Do NOT re-hide the expanded chat plate
      return { ok: true };
    }

    // Sometimes expand takes slightly longer
    const openedSlow = await waitFor(() => isChatExpanded(), { timeoutMs: 800, intervalMs: 100 });
    if (openedSlow) {
      applyBrandTheme();
      return { ok: true };
    }

    return { ok: false, reason: 'no-expand', btn };
  }

  async function startBrowserCall() {
    const chat = await openChatViaBubble();
    if (!chat.ok && chat.reason === 'disabled-button') {
      unhideNativeBubblePermanently();
    }

    const callBtn = await waitFor(() => {
      applyBrandTheme();
      const buttons = findCallButtons().filter(
        (b) => !b.disabled && b.getAttribute('disabled') == null
      );
      return buttons[0] || null;
    }, { timeoutMs: 2500, intervalMs: 150 });

    if (callBtn && clickEnabled(callBtn)) {
      applyBrandTheme();
      const calling = await waitFor(() => {
        const host = getCallUsHost();
        if (!host?.callUs?.shadowRoot) return false;
        return Boolean(
          host.callUs.shadowRoot.getElementById('dropCallBtn') ||
            host.callUs.shadowRoot.getElementById('callUsDropCallBtn') ||
            host.callUs.shadowRoot.querySelector('.calling-window, [class*="calling"]')
        );
      }, { timeoutMs: 1500, intervalMs: 100 });
      if (calling || isChatExpanded()) return { ok: true };
    }

    // Chat opened but call control missing — leave chat visible for manual call
    if (chat.ok || isChatExpanded()) {
      return { ok: true, partial: true };
    }

    return { ok: false, reason: 'no-call-control' };
  }

  function openPhonesystemTab() {
    if (!phonesystemUrl) return false;
    const base = phonesystemUrl.replace(/\/+$/, '');
    window.open(base, '_blank', 'noopener,noreferrer');
    return true;
  }

  function fallbackAfterFailure(kind) {
    console.warn(
      `[tcx-widget] ${kind} open failed — unhiding native 3CX bubble for this session`,
      { phonesystemUrl, party }
    );
    unhideNativeBubblePermanently();
    applyBrandTheme();
    // Retry click once with fully visible bubble
    const btn = findChatButton();
    if (btn) {
      revealBubbleForClick(btn);
      clickEnabled(btn);
    }
    setStatus(
      kind === 'call'
        ? 'Call window ready — use the phone button in the chat, or the 3CX bubble.'
        : 'Chat is ready — use the chat window (or the 3CX bubble).'
    );
    if (phonesystemUrl) {
      // Secondary escape hatch
      const linkHint = document.createElement('button');
      linkHint.type = 'button';
      linkHint.className = 'tcx-action tcx-action-secondary';
      linkHint.textContent = 'Open phone system';
      linkHint.addEventListener('click', () => openPhonesystemTab());
      const actions = root.querySelector('.tcx-panel-actions');
      if (actions && !root.querySelector('[data-tcx-phonesystem-link]')) {
        linkHint.setAttribute('data-tcx-phonesystem-link', '');
        actions.appendChild(linkHint);
      }
    }
  }

  async function openLiveChat() {
    if (opening) return;
    opening = true;
    const original = liveChatBtn?.textContent || 'Live chat';
    setBusy(liveChatBtn, true, 'Opening chat…');
    setStatus('Opening chat…');

    try {
      const result = await openChatViaBubble();
      if (result.ok) {
        setStatus('');
        setOpen(false);
        applyBrandTheme();
        return;
      }
      fallbackAfterFailure('chat');
    } finally {
      setBusy(liveChatBtn, false, original);
      opening = false;
    }
  }

  async function openBrowserCall() {
    if (opening) return;
    opening = true;
    const original = talkBtn?.textContent || 'Call in browser';
    setBusy(talkBtn, true, 'Starting call…');
    setStatus('Starting browser call…');

    try {
      if (hasChat) {
        const result = await startBrowserCall();
        if (result.ok) {
          setStatus(
            result.partial
              ? 'Chat open — tap the call button in the window to start voice.'
              : ''
          );
          setOpen(false);
          applyBrandTheme();
          return;
        }
        fallbackAfterFailure('call');
        return;
      }

      // No Live Chat embed — only a non-Meetings talk URL may remain
      if (talkUrl) {
        window.open(talkUrl, '_blank', 'noopener,noreferrer');
        setStatus('');
        setOpen(false);
        return;
      }

      setStatus('Browser calling is not available right now.');
      console.warn('[tcx-widget] Call in browser: no chat widget and no Talk URL');
    } finally {
      setBusy(talkBtn, false, original);
      opening = false;
    }
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      if (!open) setStatus('');
      setOpen(!open);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
  if (liveChatBtn) liveChatBtn.addEventListener('click', () => openLiveChat());
  if (talkBtn) talkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openBrowserCall();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (toggle && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
      }
    }
    if (event.key === 'Tab' && panel && !panel.hidden) {
      const nodes = focusableIn(panel);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  if (hasChat) {
    ensureCallusLoaded();
    const boot = () => {
      hideDefaultBubble();
      applyBrandTheme();
    };
    boot();
    waitFor(() => findChatButton(), { timeoutMs: 8000, intervalMs: 200 }).then((btn) => {
      if (btn) {
        hideDefaultBubble();
        applyBrandTheme();
      }
    });
    const observer = new MutationObserver(() => {
      hideDefaultBubble();
      if (!brandApplied || getCallUsHost()?.callUs) applyBrandTheme();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 25000);
  }
})();
