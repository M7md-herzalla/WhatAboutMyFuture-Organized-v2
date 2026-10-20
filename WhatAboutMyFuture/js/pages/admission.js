// 1. عناصر DOM

const searchInput = document.getElementById("searchInput");
const searchButton = document.querySelector(".search-box button");
const universityFilter = document.getElementById("universityFilter");
const collegeFilter = document.getElementById("collegeFilter");
const sortFilter = document.getElementById("sortFilter");
const resetBtn = document.getElementById("resetBtn");
const cardsContainer = document.getElementById("cardsContainer");

// 2. متغيرات Pagination

let currentPage = 1;
const itemsPerPage = 6;
let filteredData = [];

// 3. بناء بطاقة واحدة

function formatFee(value) {
  return (value === undefined || value === null || value === "-" || value === "") ? "-" : `${value} د.أ`;
}

function buildCard(item) {
  const university = SiteUtils.escapeHTML(item.university || "غير محدد");
  const college = SiteUtils.escapeHTML(item.college || "غير محدد");
  const major = SiteUtils.escapeHTML(item.major || "غير محدد");
  const acceptance = item.acceptance ?? "-";
  const hours = item.hours ?? "-";
  const image = item.image || "assets/images/m1.png";

  return `
    <div class="card">
      <div class="card-header">
        <img src="${image}" alt="${university}" loading="lazy" onerror="this.onerror=null;this.src='assets/images/m1.png'" />
        <div class="card-university">
          <h3>${university}</h3>
          <span class="college-name">${college}</span>
        </div>
      </div>
      <div class="card-body">
        <h4 class="major-name">${major}</h4>
        <div class="details-grid">
          <div class="detail-item">
            <span class="label">المعدل</span>
            <span class="value">${acceptance === "-" ? "-" : acceptance + "%"}</span>
          </div>
          <div class="detail-item">
            <span class="label">ساعات الخطة</span>
            <span class="value">${hours}</span>
          </div>
          <div class="detail-item">
            <span class="label">الرسوم العادية</span>
            <span class="value">${formatFee(item.regular)}</span>
          </div>
          <div class="detail-item">
            <span class="label">الرسوم الموازي</span>
            <span class="value">${formatFee(item.parallel)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 4. عرض الصفحة الحالية مع Pagination

function renderCards(data) {
  if (!cardsContainer) {
    console.error("❌ cardsContainer غير موجود");
    return;
  }
  filteredData = data;
  currentPage = 1;
  renderCurrentPage();
}

function renderCurrentPage() {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  if (filteredData.length === 0) {
    cardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fa-solid fa-circle-exclamation"></i>
        <h3>لا توجد نتائج مطابقة</h3>
        <p>حاول تعديل كلمات البحث أو اختيار جامعة أخرى</p>
      </div>
    `;
    return;
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  let html = '<div class="cards-grid">' + pageData.map(buildCard).join("") + '</div>';

  if (totalPages > 1) {
    html += `
      <div class="pagination">
        <button class="page-btn prev-btn" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-right"></i> السابق
        </button>
        <div class="page-numbers">
          ${getPageNumbers(currentPage, totalPages).map(page =>
            page === "..."
              ? '<span class="page-dots">...</span>'
              : `<button class="page-num ${page === currentPage ? 'active' : ''}" onclick="goToPage(${page})">${page}</button>`
          ).join("")}
        </div>
        <button class="page-btn next-btn" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>
          التالي <i class="fa-solid fa-chevron-left"></i>
        </button>
      </div>
    `;
  }

  cardsContainer.innerHTML = html;
}

function changePage(direction) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const newPage = currentPage + direction;
  if (newPage < 1 || newPage > totalPages) return;
  currentPage = newPage;
  renderCurrentPage();
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderCurrentPage();
}

// 5. دالة مساعدة لعرض أرقام الصفحات

function getPageNumbers(current, total) {
  const pages = [];
  const delta = 1;
  pages.push(1);
  let start = Math.max(2, current - delta);
  let end = Math.min(total - 1, current + delta);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) {
    if (!pages.includes(i)) pages.push(i);
  }
  if (end < total - 1) pages.push("...");
  if (total > 1 && !pages.includes(total)) pages.push(total);
  return pages;
}


// الجامعة والكلية والبحث تعمل معًا؛ لا يوجد lastAction يلغي أحد الفلاتر.
const { normalizeText } = window.SiteUtils;
const publicUniversities = new Set([
  'الجامعة الأردنية', 'جامعة اليرموك', 'جامعة العلوم والتكنولوجيا الأردنية',
  'جامعة مؤتة', 'الجامعة الهاشمية', 'جامعة آل البيت', 'جامعة البلقاء التطبيقية',
  'جامعة الطفيلة التقنية', 'جامعة الحسين بن طلال', 'جامعة العلوم الإسلامية العالمية'
].map(normalizeText));

function uniqueNames(values) {
  const names = new Map();
  for (const value of values.filter(Boolean)) {
    const key = normalizeText(value);
    if (!names.has(key)) names.set(key, value);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'ar'));
}

function populateUniversities() {
  universityFilter.replaceChildren(new Option('جميع الجامعات', 'all'));
  const groups = [
    { label: '🏛️ الجامعات الحكومية', isPublic: true },
    { label: '🏫 الجامعات الخاصة', isPublic: false }
  ];
  const names = uniqueNames(universities.map(item => item.university));
  for (const group of groups) {
    const element = document.createElement('optgroup');
    element.label = group.label;
    for (const name of names) {
      if (publicUniversities.has(normalizeText(name)) === group.isPublic)
        element.append(new Option(name, name));
    }
    if (element.children.length) universityFilter.append(element);
  }
}

function populateColleges() {
  const university = universityFilter.value;
  const records = universities.filter(item =>
    university === 'all' || normalizeText(item.university) === normalizeText(university)
  );
  collegeFilter.replaceChildren(new Option('جميع الكليات', 'all'));
  for (const name of uniqueNames(records.map(item => item.college)))
    collegeFilter.append(new Option(name, name));
}

function filterData() {
  const words = normalizeText(searchInput?.value ?? '').split(' ').filter(Boolean);
  const university = universityFilter.value;
  const college = collegeFilter.value;
  const records = universities.filter(item => {
    const matchUniversity = university === 'all' ||
      normalizeText(item.university) === normalizeText(university);
    const matchCollege = college === 'all' ||
      normalizeText(item.college) === normalizeText(college);
    const fullText = normalizeText([item.major, item.university, item.college].join(' '));
    return matchUniversity && matchCollege && words.every(word => fullText.includes(word));
  });
  records.sort((a, b) => sortFilter.value === 'low'
    ? (Number(a.acceptance) || 0) - (Number(b.acceptance) || 0)
    : (Number(b.acceptance) || 0) - (Number(a.acceptance) || 0));
  const count = document.getElementById('resultsCount');
  if (count) count.textContent = records.length
    ? `عدد النتائج: ${records.length} سجل تخصص ضمن البيانات المتوفرة`
    : 'لا توجد نتائج مطابقة ضمن البيانات المتوفرة.';
  renderCards(records);
}

function resetFilters() {
  if (searchInput) searchInput.value = '';
  universityFilter.value = 'all';
  sortFilter.value = 'high';
  populateColleges();
  filterData();
}

function scrollToResults() {
  document.querySelector('.universities')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

searchInput?.addEventListener('input', filterData);
searchInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); filterData(); scrollToResults(); }
});
searchButton?.addEventListener('click', () => { filterData(); scrollToResults(); });
universityFilter.addEventListener('change', () => { populateColleges(); filterData(); });
collegeFilter.addEventListener('change', filterData);
sortFilter.addEventListener('change', filterData);
resetBtn.addEventListener('click', resetFilters);
populateUniversities();
populateColleges();
filterData();

