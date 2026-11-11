/*
 * Shop.co client pages: the light/dark switch, dates that keep themselves current, and the
 * contact buttons. Plain JavaScript, no libraries. The pages read fine without it.
 */
(function () {
  'use strict';

  // How clients reach you. Add a WhatsApp number (digits only, with the country code, for
  // example '2348012345678') and a WhatsApp button appears on every page.
  var CONTACT = {
    email: 'khariz.digital@gmail.com',
    whatsapp: '',
  };

  var root = document.documentElement;
  var THEME_KEY = 'shopco_pages_theme';

  function savedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null; // storage blocked: the page stays light, the switch still works for this visit
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('title', theme === 'dark' ? 'Light mode' : 'Dark mode');
    });
  }

  // Light unless the reader chose dark before.
  applyTheme(savedTheme() === 'dark' ? 'dark' : 'light');

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-theme-toggle]');
    if (!button) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      // not remembered, but applied
    }
  });

  // Dates: "November 2026" and "2026" always show the current month and year.
  var now = new Date();
  var monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.querySelectorAll('[data-month-year]').forEach(function (el) {
    el.textContent = monthYear;
  });
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(now.getFullYear());
  });

  // Contact buttons.
  document.querySelectorAll('[data-contact="email"]').forEach(function (link) {
    var subject = link.getAttribute('data-subject') || 'My online store';
    link.setAttribute('href', 'mailto:' + CONTACT.email + '?subject=' + encodeURIComponent(subject));
    if (link.hasAttribute('data-show-address')) link.textContent = CONTACT.email;
  });
  document.querySelectorAll('[data-contact="whatsapp"]').forEach(function (link) {
    if (!CONTACT.whatsapp) return; // stays hidden until a number is set above
    var text = link.getAttribute('data-text') || 'Hello, I would like to talk about an online store.';
    link.setAttribute('href', 'https://wa.me/' + CONTACT.whatsapp + '?text=' + encodeURIComponent(text));
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
    link.hidden = false;
  });
})();
