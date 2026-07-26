/**
 * Hide 3CX "Powered by 3CX" branding inside open shadow roots.
 * Native call-us bubble only — no custom FAB/panel.
 */
(function () {
  'use strict';

  var STYLE_ID = 'tcx-hide-powered-by';
  var POWERED_RE = /powered\s+by\s+3cx/i;
  var CSS =
    'a[href*="3cx.com"],' +
    'a[href*="3cx.com"] *,' +
    '[class*="powered"],' +
    '[class*="Powered"],' +
    '[id*="powered"],' +
    '[id*="Powered"],' +
    '[part*="powered"]{' +
    'display:none!important;visibility:hidden!important;' +
    'height:0!important;max-height:0!important;overflow:hidden!important;' +
    'pointer-events:none!important;opacity:0!important;' +
    'margin:0!important;padding:0!important;font-size:0!important;line-height:0!important;' +
    '}';

  function injectStyle(root) {
    if (!root || root.getElementById(STYLE_ID)) return;
    try {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (root.head || root).appendChild(style);
    } catch (_) {
      /* ignore closed / restricted roots */
    }
  }

  function hideMatchingNodes(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes;
    try {
      nodes = root.querySelectorAll('a, span, div, p, small, label, button, li');
    } catch (_) {
      return;
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 40) continue;
      if (!POWERED_RE.test(text)) continue;
      try {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.setAttribute('aria-hidden', 'true');
      } catch (_) {
        /* ignore */
      }
    }
  }

  function walkShadow(host) {
    if (!host || !host.shadowRoot) return;
    var root = host.shadowRoot;
    injectStyle(root);
    hideMatchingNodes(root);
    var nested;
    try {
      nested = root.querySelectorAll('*');
    } catch (_) {
      return;
    }
    for (var i = 0; i < nested.length; i++) {
      if (nested[i].shadowRoot) walkShadow(nested[i]);
    }
  }

  function scrub() {
    var hosts = document.querySelectorAll(
      'call-us-selector, call-us, #wp-live-chat-by-3CX, [id*="live-chat-by-3CX"]'
    );
    for (var i = 0; i < hosts.length; i++) {
      walkShadow(hosts[i]);
      if (hosts[i].shadowRoot) {
        var inner = hosts[i].shadowRoot.querySelectorAll('call-us, call-us-selector, *');
        for (var j = 0; j < inner.length; j++) {
          if (inner[j].shadowRoot) walkShadow(inner[j]);
        }
      }
    }
  }

  var observer = null;
  var stopTimer = null;

  function startWatch() {
    scrub();
    if (observer) return;
    observer = new MutationObserver(function () {
      scrub();
    });
    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch (_) {
      /* ignore */
    }
    /* Keep watching briefly while the widget mounts / opens */
    clearTimeout(stopTimer);
    stopTimer = setTimeout(function () {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      /* Light re-scrub if chat opens later */
      document.addEventListener(
        'click',
        function onClick() {
          scrub();
          setTimeout(scrub, 200);
          setTimeout(scrub, 800);
        },
        true
      );
    }, 45000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWatch);
  } else {
    startWatch();
  }

  /* callus.js is deferred — poll until selector appears */
  var tries = 0;
  var poll = setInterval(function () {
    tries += 1;
    scrub();
    if (
      tries >= 60 ||
      document.querySelector('call-us-selector, call-us, #wp-live-chat-by-3CX')
    ) {
      if (tries >= 12) clearInterval(poll);
    }
    if (tries >= 60) clearInterval(poll);
  }, 500);
})();
