// Small helpers shared by the two search pages.
window.SiteUtils = Object.freeze({
  normalizeText(value) {
    return String(value ?? '').normalize('NFKD')
      .replace(/[\u0617-\u061A\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ى|ی/g, 'ي').replace(/ک/g, 'ك')
      .replace(/ة/g, 'ه').toLowerCase().trim().replace(/\s+/g, ' ');
  },
  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
});
