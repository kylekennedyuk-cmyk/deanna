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

  window.DWD = { showToast };
})();
