(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showToast(message, timeout = 2200) {
    const root = document.getElementById('toast-root');
    if (!root || !message) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.replaceChildren(el);
    window.setTimeout(() => {
      if (el.parentNode === root) root.removeChild(el);
    }, timeout);
  }

  document.querySelectorAll('[data-chip-group]').forEach((group) => {
    const multi = group.dataset.multi === 'true';
    const hidden = group.querySelector('input[data-chip-value]');
    const inputs = [...group.querySelectorAll('input.chip-input')];

    function sync() {
      inputs.forEach((input) => {
        const chip = input.closest('.chip');
        if (!chip) return;
        chip.classList.toggle('chip-active', input.checked);
        chip.setAttribute('aria-pressed', input.checked ? 'true' : 'false');
      });
      if (hidden) {
        hidden.value = inputs.filter((i) => i.checked).map((i) => i.value).join(', ');
      }
    }

    inputs.forEach((input) => {
      input.addEventListener('change', () => {
        if (!multi && input.checked) {
          inputs.forEach((other) => {
            if (other !== input) other.checked = false;
          });
        }
        sync();
        showToast('Saved');
      });
    });
    sync();
  });

  const drawer = document.querySelector('[data-drawer]');
  if (drawer) {
    const toggles = document.querySelectorAll('[data-menu-toggle]');
    const closers = drawer.querySelectorAll('[data-menu-close]');

    const openDrawer = () => {
      drawer.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      toggles.forEach((t) => t.setAttribute('aria-expanded', 'true'));
      const firstLink = drawer.querySelector('a, button');
      if (firstLink) firstLink.focus();
    };

    const closeDrawer = () => {
      drawer.classList.add('hidden');
      document.body.style.overflow = '';
      toggles.forEach((t) => t.setAttribute('aria-expanded', 'false'));
    };

    toggles.forEach((t) => t.addEventListener('click', openDrawer));
    closers.forEach((c) => c.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !drawer.classList.contains('hidden')) closeDrawer();
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
      if (event.matches) closeDrawer();
    });
  }

  document.querySelectorAll('[data-collapsible]').forEach((panel) => {
    const trigger = panel.querySelector('[data-collapsible-trigger]');
    const body = panel.querySelector('[data-collapsible-body]');
    if (!trigger || !body) return;
    trigger.addEventListener('click', () => {
      const open = panel.dataset.open === 'true';
      panel.dataset.open = open ? 'false' : 'true';
      body.hidden = open;
      trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });

  document.querySelectorAll('form[data-autosave-toast]').forEach((form) => {
    form.addEventListener('change', () => showToast('Saved'));
  });

  document.querySelectorAll('[data-quick-reply]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.target || '#message-content');
      if (target) {
        target.value = btn.dataset.quickReply || '';
        target.focus();
      }
    });
  });

  document.querySelectorAll('[data-show-more]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const root = btn.closest('section') || document;
      root.querySelectorAll('[data-show-more-item]').forEach((el) => {
        el.hidden = false;
        el.removeAttribute('hidden');
        el.classList.remove('is-show-more-hidden');
      });
      btn.hidden = true;
    });
  });

  if (!reduceMotion) {
    document.querySelectorAll('[data-float]').forEach((el) => {
      el.classList.add('animate-floaty');
    });
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('saved') === '1' || params.get('created') === '1') {
    showToast(params.get('created') === '1' ? 'Plan submitted' : 'Saved');
  }

  function decodeEmailPart(value) {
    try {
      return atob(value || '')
        .split('')
        .reverse()
        .join('');
    } catch {
      return '';
    }
  }

  function resolveSafeEmail(btn) {
    const user = decodeEmailPart(btn.dataset.u);
    const domain = decodeEmailPart(btn.dataset.d);
    if (!user || !domain) return '';
    return `${user}@${domain}`;
  }

  /** Canvas fillStyle rejects some modern CSS color() values — normalize via pixel readback. */
  function canvasSafeColor(cssColor, fallback) {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = fallback;
    try {
      if (cssColor) ctx.fillStyle = cssColor;
    } catch {
      ctx.fillStyle = fallback;
    }
    ctx.fillRect(0, 0, 1, 1);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    if (!pixel[3]) return fallback;
    return `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${(pixel[3] / 255).toFixed(3)})`;
  }

  function paintSafeEmail(btn) {
    const canvas = btn.querySelector('.safe-email__canvas');
    if (!canvas) return;
    const address = resolveSafeEmail(btn);
    if (!address) return;

    const styles = window.getComputedStyle(btn);
    const fontWeight = styles.fontWeight || '600';
    const fontSize = styles.fontSize || '14px';
    const fontFamily = styles.fontFamily || 'Outfit, system-ui, sans-serif';
    const fallback = btn.classList.contains('safe-email--btn') ? '#ffffff' : '#845425';
    const color = canvasSafeColor(styles.color, fallback);
    const underline = btn.classList.contains('safe-email--link');
    const font = `${fontWeight} ${fontSize} ${fontFamily}`;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const textWidth = Math.max(1, Math.ceil(measure.measureText(address).width));
    const sizePx = parseFloat(fontSize) || 14;
    const padX = underline ? 0 : 2;
    const padY = 3;
    const cssW = Math.max(1, textWidth + padX * 2);
    const cssH = Math.max(18, Math.ceil(sizePx * 1.4) + padY * 2);

    canvas.width = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(address, padX, cssH / 2);

    if (underline) {
      const y = Math.min(cssH - 1, Math.round(cssH * 0.88));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + textWidth, y);
      ctx.stroke();
    }
  }

  function initSafeEmails() {
    document.querySelectorAll('button.safe-email').forEach((btn) => {
      paintSafeEmail(btn);
      if (btn.dataset.safeEmailBound === '1') return;
      btn.dataset.safeEmailBound = '1';
      btn.addEventListener('click', () => {
        const address = resolveSafeEmail(btn);
        if (!address) return;
        window.location.href = `mailto:${address}`;
      });
    });
  }

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(initSafeEmails).catch(initSafeEmails);
  window.addEventListener('resize', () => {
    document.querySelectorAll('button.safe-email').forEach(paintSafeEmail);
  });

  function parseTrustedHosts(raw) {
    const hosts = new Set(
      String(raw || '')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    );
    if (window.location.hostname) hosts.add(window.location.hostname.toLowerCase());
    hosts.add('destinationswithdeanna.com');
    hosts.add('www.destinationswithdeanna.com');
    return hosts;
  }

  function isExternalHttpUrl(href, trustedHosts) {
    try {
      const url = new URL(href, window.location.href);
      const protocol = url.protocol.toLowerCase();
      if (protocol === 'mailto:' || protocol === 'tel:') return false;
      if (protocol !== 'http:' && protocol !== 'https:') return true;
      const host = url.hostname.toLowerCase();
      if (trustedHosts.has(host)) return false;
      const bare = host.replace(/^www\./, '');
      if (trustedHosts.has(bare) || trustedHosts.has(`www.${bare}`)) return false;
      return true;
    } catch {
      return true;
    }
  }

  function confirmExternalLink(href) {
    return window.confirm(
      `This link goes to an external website:\n\n${href}\n\nOnly continue if you trust the sender.\n\nOpen this link?`
    );
  }

  function openMailHref(href, trustedHosts) {
    const raw = String(href || '').trim();
    if (!raw || raw.startsWith('#')) return;

    let absolute = raw;
    try {
      absolute = new URL(raw, window.location.href).href;
    } catch {
      return;
    }

    const lower = absolute.toLowerCase();
    if (lower.startsWith('mailto:') || lower.startsWith('tel:')) {
      window.location.href = absolute;
      return;
    }

    if (isExternalHttpUrl(absolute, trustedHosts) && !confirmExternalLink(absolute)) {
      return;
    }

    window.open(absolute, '_blank', 'noopener,noreferrer');
  }

  function styleMailAnchor(anchor) {
    anchor.style.color = '#1a2b40';
    anchor.style.textDecoration = 'underline';
    anchor.style.cursor = 'pointer';
    anchor.style.pointerEvents = 'auto';
  }

  function bindMailAnchor(anchor, trustedHosts) {
    if (!anchor || anchor.dataset.mailLinkBound === '1') return;
    anchor.dataset.mailLinkBound = '1';
    styleMailAnchor(anchor);
    if (!anchor.getAttribute('target')) anchor.setAttribute('target', '_blank');
    if (!anchor.getAttribute('rel')) anchor.setAttribute('rel', 'noopener noreferrer');
  }

  const URL_IN_TEXT = /(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[^\s<>"']+)/gi;

  function trimUrlMatch(raw) {
    let url = raw;
    let trailing = '';
    while (url && /[.,;:!?)\]'"”’]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return { url, trailing };
  }

  function linkifyTextNode(textNode, trustedHosts) {
    const text = textNode.nodeValue || '';
    if (!text || !URL_IN_TEXT.test(text)) return;
    URL_IN_TEXT.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = URL_IN_TEXT.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const parts = trimUrlMatch(match[0]);
      if (parts.url) {
        const anchor = document.createElement('a');
        anchor.href = parts.url;
        anchor.textContent = parts.url;
        bindMailAnchor(anchor, trustedHosts);
        frag.appendChild(anchor);
      }
      if (parts.trailing) frag.appendChild(document.createTextNode(parts.trailing));
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex === 0) return;
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function linkifyTree(root, trustedHosts) {
    const skip = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (skip.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !/https?:\/\/|mailto:|tel:/i.test(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    nodes.forEach((node) => linkifyTextNode(node, trustedHosts));
  }

  function enhanceMailRoot(root, trustedHosts) {
    if (!root) return;
    linkifyTree(root, trustedHosts);
    root.querySelectorAll('a[href]').forEach((anchor) => bindMailAnchor(anchor, trustedHosts));
  }

  function onMailLinkClick(event) {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const root = anchor.closest('[data-mail-html], [data-mail-plain]');
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    const trustedHosts = parseTrustedHosts(root.dataset.trustedHosts || '');
    openMailHref(anchor.getAttribute('href'), trustedHosts);
  }

  function initMailHtmlBodies() {
    document.querySelectorAll('[data-mail-html]').forEach((el) => {
      if (el.dataset.mailHtmlBound === '1') return;
      el.dataset.mailHtmlBound = '1';
      const trustedHosts = parseTrustedHosts(el.dataset.trustedHosts);
      enhanceMailRoot(el, trustedHosts);
    });
  }

  function linkifyPlainMail(el) {
    if (!el || el.dataset.mailPlainBound === '1') return;
    el.dataset.mailPlainBound = '1';
    const trustedHosts = parseTrustedHosts(el.dataset.trustedHosts || '');
    linkifyTree(el, trustedHosts);
    el.querySelectorAll('a[href]').forEach((anchor) => bindMailAnchor(anchor, trustedHosts));
  }

  function initPlainMailBodies() {
    document.querySelectorAll('[data-mail-plain]').forEach(linkifyPlainMail);
  }

  document.addEventListener('click', onMailLinkClick);
  initMailHtmlBodies();
  initPlainMailBodies();

  function closePortalMenu(menu) {
    if (!menu) return;
    const trigger = menu.querySelector('[data-portal-menu-trigger]');
    const panel = menu.querySelector('[data-portal-menu-panel]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
  }

  function closeAllPortalMenus(except) {
    document.querySelectorAll('[data-portal-menu]').forEach((menu) => {
      if (except && menu === except) return;
      closePortalMenu(menu);
    });
  }

  function openPortalMenu(menu) {
    closeAllPortalMenus(menu);
    const trigger = menu.querySelector('[data-portal-menu-trigger]');
    const panel = menu.querySelector('[data-portal-menu-panel]');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    if (panel) panel.hidden = false;
  }

  function initPortalMenus() {
    document.querySelectorAll('[data-portal-menu]').forEach((menu) => {
      if (menu.dataset.portalMenuBound === '1') return;
      menu.dataset.portalMenuBound = '1';
      const trigger = menu.querySelector('[data-portal-menu-trigger]');
      if (!trigger) return;

      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = trigger.getAttribute('aria-expanded') === 'true';
        if (open) closePortalMenu(menu);
        else openPortalMenu(menu);
      });
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-portal-menu]')) return;
      closeAllPortalMenus();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllPortalMenus();
    });
  }

  initPortalMenus();

  window.DWD = { showToast };
})();
