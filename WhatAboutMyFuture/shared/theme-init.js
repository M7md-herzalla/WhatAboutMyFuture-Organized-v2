// Runs in <head> before the CSS to apply the saved theme without a flash.
(() => {
  let saved;
  try { saved = localStorage.getItem('theme'); } catch { /* Storage can be disabled. */ }
  const theme = saved === 'dark' || saved === 'light'
    ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
