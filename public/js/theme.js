// Tema terang/gelap. Dimuat di <head> agar tidak berkedip. Pilihan tersimpan; default mengikuti sistem.
(function () {
  const KEY = 'pos_theme', root = document.documentElement;
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const eff = () => saved() || (mq && mq.matches ? 'dark' : 'light');
  const SVG = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const MOON = SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');
  const SUN = SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>');
  const apply = () => { const dark = eff() === 'dark'; root.setAttribute('data-theme', eff()); document.querySelectorAll('button.theme').forEach((b) => { b.innerHTML = dark ? SUN : MOON; b.title = dark ? 'Ganti ke mode terang (Alt+T)' : 'Ganti ke mode gelap (Alt+T)'; b.setAttribute('aria-label', dark ? 'Mode terang' : 'Mode gelap'); }); };
  window.Theme = {
    toggle() { try { localStorage.setItem(KEY, eff() === 'dark' ? 'light' : 'dark'); } catch (e) {} apply(); },
    mount(el) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sm theme ic'; b.addEventListener('click', Theme.toggle); el.appendChild(b); apply(); },
  };
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (!saved()) apply(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
  document.addEventListener('keydown', (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') { e.preventDefault(); Theme.toggle(); } });
})();
