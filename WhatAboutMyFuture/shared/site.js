// Shared header, footer, navigation and theme. Page logic stays in js/pages/.
(() => {
  const root = new URL('../', document.currentScript.src);
  const html = document.documentElement;

  async function loadPart(id, filename) {
    const target = document.getElementById(id);
    if (!target) return;
    const response = await fetch(new URL(filename, root));
    if (!response.ok) throw new Error(`تعذر تحميل ${filename}: ${response.status}`);
    target.innerHTML = await response.text();
    target.querySelectorAll('a[href]').forEach(link => {
      link.href = new URL(link.getAttribute('href'), root).href;
    });
  }

  function setupHeader() {
    const nav = document.getElementById('mainNav');
    const menu = document.getElementById('menuToggle');
    const themeButton = document.getElementById('themeToggle');
    const active = document.body.dataset.navigation;
    nav?.querySelectorAll('[data-nav]').forEach(link => {
      const selected = link.dataset.nav === active;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
    });
    function closeMenu() {
      nav?.classList.remove('open');
      menu?.setAttribute('aria-expanded', 'false');
    }
    menu?.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
    nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    document.addEventListener('click', event => {
      if (!nav?.contains(event.target) && !menu?.contains(event.target)) closeMenu();
    });
    function updateThemeButton() {
      if (!themeButton) return;
      const dark = html.dataset.theme === 'dark';
      themeButton.textContent = dark ? '☀️' : '🌙';
      themeButton.setAttribute('aria-label', dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي');
    }
    updateThemeButton();
    themeButton?.addEventListener('click', () => {
      const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
      html.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch { /* Theme still works for this page. */ }
      updateThemeButton();
    });
  }

  Promise.allSettled([
    loadPart('site-header', 'shared/header.html'),
    loadPart('site-footer', 'shared/footer.html')
  ]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(result.reason);
        document.getElementById(index === 0 ? 'site-header' : 'site-footer').textContent = 'تعذر تحميل الجزء المشترك. شغّل الموقع عبر Live Server ثم حدّث الصفحة.';
      }
    });
    setupHeader();
    html.dataset.siteReady = 'true';
    window.dispatchEvent(new Event('site:ready'));
  });
})();
