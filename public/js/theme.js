// Tema terang/gelap. Dimuat di <head> agar tidak berkedip. Pilihan tersimpan; default mengikuti sistem.
(function () {
  const KEY = 'pos_theme', root = document.documentElement;
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const eff = () => saved() || (mq && mq.matches ? 'dark' : 'light');
  const apply = () => { root.setAttribute('data-theme', eff()); document.querySelectorAll('button.theme').forEach((b) => { b.textContent = eff() === 'dark' ? 'Terang' : 'Gelap'; b.title = 'Ganti tema (Alt+T)'; }); };
  window.Theme = {
    toggle() { try { localStorage.setItem(KEY, eff() === 'dark' ? 'light' : 'dark'); } catch (e) {} apply(); },
    mount(el) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sm theme'; b.addEventListener('click', Theme.toggle); el.appendChild(b); apply(); },
  };
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (!saved()) apply(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
  document.addEventListener('keydown', (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') { e.preventDefault(); Theme.toggle(); } });
})();
