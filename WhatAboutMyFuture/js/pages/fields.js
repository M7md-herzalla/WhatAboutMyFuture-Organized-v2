// Fields search, suggestions and result. Data is loaded before this file.
(() => {
  const input = document.getElementById('majorInput');
  const list = document.getElementById('suggestionsList');
  const button = document.getElementById('searchBtn');
  const result = document.getElementById('result');
  const wrapper = input.closest('.input-wrapper');
  const { normalizeText, escapeHTML: escape } = window.SiteUtils;
  const catalog = MAJORS.map(major => ({ original: major, normalized: normalizeText(major.name) }));

  function hideSuggestions() {
    list.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
  }
  function selectSuggestion(name) {
    input.value = name;
    hideSuggestions();
    searchMajor();
  }
  function showSuggestions() {
    const query = normalizeText(input.value);
    const matches = query ? catalog.filter(item => item.normalized.includes(query)).slice(0, 10) : [];
    list.replaceChildren();
    if (!matches.length) { hideSuggestions(); return; }
    for (const item of matches) {
      const li = document.createElement('li');
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = item.original.name;
      option.addEventListener('click', () => selectSuggestion(item.original.name));
      option.addEventListener('keydown', event => {
        const options = [...list.querySelectorAll('button')];
        const index = options.indexOf(option);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
        }
        if (event.key === 'Escape') { hideSuggestions(); input.focus(); }
      });
      li.append(option);
      list.append(li);
    }
    list.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  }

  function minimumAverage(config, name) {
    if (!config.minAverage || typeof config.minAverage !== 'object') return config.minAverage || 'غير محدد';
    if (name.includes('بيطري')) return config.minAverage.veterinary || 'غير محدد';
    if (name.includes('صيدلة')) return config.minAverage.pharmacy || 'غير محدد';
    return config.minAverage.medical || 'غير محدد';
  }
  function subjects(configs, key) {
    return configs.filter(config => config[key]?.length).map(config => `
      <div class="field-group"><strong>${escape(config.name)}</strong>
        <ul>${config[key].map(subject => `<li>${escape(subject)}</li>`).join('')}</ul>
      </div>`).join('') || '<p>لا توجد مواد مسجلة في البيانات الحالية.</p>';
  }
  function searchMajor() {
    hideSuggestions();
    result.style.display = 'block';
    const query = normalizeText(input.value);
    if (!query) { result.innerHTML = '<h2>أدخل اسم تخصص</h2><p>ابدأ بالكتابة ثم اختر تخصصًا من الاقتراحات.</p>'; return; }
    const match = catalog.find(item => item.normalized === query) || catalog.find(item => item.normalized.includes(query));
    if (!match) { result.innerHTML = `<h2>التخصص غير موجود</h2><p>لم نجد «${escape(input.value)}» في قائمة التخصصات الحالية.</p>`; return; }
    const major = match.original;
    const configs = major.fields.map(id => FIELD_CONFIG[id]).filter(Boolean);
    if (!configs.length) { result.innerHTML = '<h2>لا توجد بيانات للحقل</h2><p>هذا التخصص يحتاج إلى ربطه بحقل في ملف البيانات.</p>'; return; }
    const academic = [...new Set(configs.flatMap(config => config.pathways?.academic || []))];
    const vocational = [...new Set(configs.flatMap(config => config.pathways?.vocational || []))];
    result.innerHTML = `
      <h2>${escape(major.name)}</h2>
      <div class="info"><strong>الحقول:</strong> ${configs.map(config => `<span class="field-chip">${escape(config.name)}</span>`).join('')}</div>
      <p class="info"><strong>النوع:</strong> ${[...new Set(configs.map(config => config.type))].map(escape).join('، ')}</p>
      <div class="info"><strong>أدنى معدل قبول موحد وفق البيانات المسجلة:</strong>
        ${configs.map(config => `<p>${escape(config.name)}: ${escape(minimumAverage(config, major.name))}</p>`).join('')}
      </div>
      <div class="info"><strong>المسارات المسموحة للقبول:</strong>
        ${academic.length ? `<p>🎓 المسار الأكاديمي: ${academic.map(escape).join('، ')}</p>` : ''}
        ${vocational.length ? `<p>🔧 المسار المهني (BTEC): ${vocational.map(escape).join('، ')}</p>` : ''}
      </div>
      <h3>📚 المواد الإجبارية الأساسية</h3>${subjects(configs, 'compulsory')}
      <h3>📖 المواد الاختيارية الموصى بها</h3>${subjects(configs, 'elective')}
      <h3>🔄 تخصصات بديلة مقترحة</h3>
      ${major.alternatives.length ? `<ul>${major.alternatives.map(name => `<li>${escape(name)}</li>`).join('')}</ul>` : '<p>لا توجد بدائل مسجلة حاليًا.</p>'}
      <hr><p class="result-disclaimer">هذه المعلومات من بيانات المشروع الحالية. راجع سياسة القبول الرسمية والمحدثة قبل اعتمادها في قرارك.</p>`;
  }

  input.addEventListener('input', () => { result.style.display = 'none'; showSuggestions(); });
  input.addEventListener('focus', () => { if (input.value.trim()) showSuggestions(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); searchMajor(); }
    if (event.key === 'Escape') hideSuggestions();
    if (event.key === 'ArrowDown' && list.style.display === 'block') {
      event.preventDefault(); list.querySelector('button')?.focus();
    }
  });
  wrapper.addEventListener('focusout', () => {
    setTimeout(() => { if (!wrapper.contains(document.activeElement)) hideSuggestions(); }, 0);
  });
  document.addEventListener('pointerdown', event => { if (!wrapper.contains(event.target)) hideSuggestions(); });
  button.addEventListener('click', searchMajor);
  const requestedMajor = new URLSearchParams(location.search).get('major');
  if (requestedMajor) input.value = requestedMajor;
  if (input.value.trim()) searchMajor();
})();
