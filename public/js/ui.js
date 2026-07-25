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

  window.DWD = { showToast };
})();
