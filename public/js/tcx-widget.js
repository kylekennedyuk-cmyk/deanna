/**
 * Branded 3CX floating widget.
 *
 * Opening live chat (reliable path):
 *   call-us-selector.shadowRoot → call-us.shadowRoot → #wplc-chat-button.click()
 * 3CX has no public open API; nested shadow DOM click is the community-proven approach.
 * We hide #wplc-chat-button visually but keep it clickable via JS.
 *
 * Fallback (if bubble never mounts): branded slide-over iframe pointing at
 *   {phonesystemUrl}/callus/#party={party}
 * plus a “open in new tab” link. That URL pattern is best-effort — Talk/tel still work.
 */
(() => {
  const root = document.querySelector('[data-tcx-widget]');
  if (!root) return;

  const toggle = root.querySelector('[data-tcx-toggle]');
  const panel = root.querySelector('[data-tcx-panel]');
  const closeBtn = root.querySelector('[data-tcx-close]');
  const liveChatBtn = root.querySelector('[data-tcx-live-chat]');
  const fallback = root.querySelector('[data-tcx-fallback]');
  const fallbackFrame = root.querySelector('[data-tcx-fallback-frame]');
  const fallbackLink = root.querySelector('[data-tcx-fallback-link]');
  const phonesystemUrl = root.dataset.phonesystemUrl || '';
  const party = root.dataset.party || '';
  const hasChat = root.dataset.hasChat === 'true';

  let lastFocus = null;

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

  function findChatButton() {
    const selector = document.querySelector('call-us-selector');
    if (!selector || !selector.shadowRoot) return null;
    const callUs = selector.shadowRoot.querySelector('call-us');
    if (!callUs || !callUs.shadowRoot) return null;
    return (
      callUs.shadowRoot.getElementById('wplc-chat-button') ||
      callUs.shadowRoot.querySelector('#wplc-chat-button, button, [role="button"]')
    );
  }

  /** Hide default 3CX launcher chrome while keeping the node clickable. */
  function hideDefaultBubble() {
    const btn = findChatButton();
    if (!btn) return;
    // Only hide the minimized bubble — leave expanded chat plate fully visible
    if (btn.getAttribute('data-tcx-hidden') === '1') return;
    btn.style.setProperty('opacity', '0', 'important');
    btn.style.setProperty('visibility', 'hidden', 'important');
    btn.style.setProperty('pointer-events', 'none', 'important');
    btn.style.setProperty('width', '1px', 'important');
    btn.style.setProperty('height', '1px', 'important');
    btn.setAttribute('aria-hidden', 'true');
    btn.setAttribute('data-tcx-hidden', '1');
  }

  function waitForChatButton(attempt = 1) {
    return new Promise((resolve) => {
      const btn = findChatButton();
      if (btn) {
        hideDefaultBubble();
        resolve(btn);
        return;
      }
      if (attempt >= 24) {
        resolve(null);
        return;
      }
      window.setTimeout(() => {
        waitForChatButton(attempt + 1).then(resolve);
      }, 400);
    });
  }

  function chatFallbackUrl() {
    if (!phonesystemUrl || !party) return '';
    const base = phonesystemUrl.replace(/\/+$/, '');
    return `${base}/callus/#party=${encodeURIComponent(party)}`;
  }

  function openFallback() {
    const url = chatFallbackUrl();
    if (!fallback) {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (fallbackFrame && url) fallbackFrame.src = url;
    if (fallbackLink && url) fallbackLink.href = url;
    fallback.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeFallback() {
    if (!fallback) return;
    fallback.hidden = true;
    document.body.style.overflow = '';
    if (fallbackFrame) fallbackFrame.removeAttribute('src');
  }

  async function openLiveChat() {
    setOpen(false);
    const btn = await waitForChatButton();
    if (btn) {
      // Temporarily restore so the synthetic click registers, then re-hide the bubble chrome
      btn.style.pointerEvents = 'auto';
      btn.style.visibility = 'visible';
      btn.style.opacity = '0';
      btn.click();
      window.setTimeout(() => {
        hideDefaultBubble();
        // Re-apply hide only to minimized state; if chat plate is open, bubble may be gone
        const still = findChatButton();
        if (still) {
          still.style.setProperty('opacity', '0', 'important');
          still.style.setProperty('visibility', 'hidden', 'important');
          still.style.setProperty('pointer-events', 'none', 'important');
        }
      }, 300);
      return;
    }
    openFallback();
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      setOpen(!open);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
  if (liveChatBtn) liveChatBtn.addEventListener('click', () => openLiveChat());

  root.querySelectorAll('[data-tcx-fallback-close]').forEach((el) => {
    el.addEventListener('click', closeFallback);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (fallback && !fallback.hidden) {
        closeFallback();
        return;
      }
      if (toggle && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
      }
    }
    // Light focus trap while panel is open
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

  // Poll briefly after load to hide the default bubble as soon as it mounts
  if (hasChat) {
    waitForChatButton();
    const observer = new MutationObserver(() => hideDefaultBubble());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 20000);
  }
})();
