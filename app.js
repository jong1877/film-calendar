const STORAGE_KEY = 'shooting_log_jobs_v1';
const CALENDAR_VISIBLE_KEY = 'shooting_log_calendar_visible_v1';
const THEME_KEY = 'shooting_log_theme_v1';
const CATEGORIES = ['컨텐츠', '광고', '영화', '드라마', '웹예능', '홍보영상', '스케치', '인터뷰', '미분류'];
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const VIEW_ORDER = ['dashboard', 'jobs', 'settings'];

const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

function loadJobs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load jobs', e);
    return [];
  }
}

function saveJobs(jobs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7);
}

function weekdayLabel(dateStr) {
  return WEEKDAY_LABELS[new Date(dateStr + 'T00:00:00').getDay()];
}

function formatDateWithWeekday(dateStr) {
  return `${dateStr} ${weekdayLabel(dateStr)}요일`;
}

function formatDateRange(job) {
  if (!job.endDate || job.endDate === job.date) return formatDateWithWeekday(job.date);
  return `${formatDateWithWeekday(job.date)} ~ ${formatDateWithWeekday(job.endDate)}`;
}

function hexToRgbArr(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function contrastTextColor(hex) {
  const [r, g, b] = hexToRgbArr(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A1A' : '#FFFFFF';
}

function hexWithAlpha(hex, alphaHex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return `#${full}${alphaHex}`;
}

function jobDateRange(job) {
  const start = job.date;
  const end = job.endDate || job.date;
  const dates = [];
  let d = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (d <= endD) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function formatWon(n) {
  return (n || 0).toLocaleString('ko-KR') + '원';
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  state.theme = theme;
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) metaThemeColor.setAttribute('content', theme === 'dark' ? '#0B0C10' : '#FBF7F2');
}

const state = {
  jobs: loadJobs(),
  currentView: 'dashboard',
  dashMonth: monthKeyOf(todayStr()),
  jobsMonth: monthKeyOf(todayStr()),
  filterCategory: '',
  filterSettled: '',
  showAllUnsettled: false,
  editingJobId: null,
  calendarVisible: localStorage.getItem(CALENDAR_VISIBLE_KEY) !== 'false',
  theme: localStorage.getItem(THEME_KEY) || (systemPrefersDark() ? 'dark' : 'light'),
  isAnimating: false,
};

function jobsInMonth(monthKey) {
  return state.jobs.filter(j => monthKeyOf(j.date) === monthKey);
}

function computeSummary(monthKey) {
  const jobs = jobsInMonth(monthKey);
  const summary = {
    count: jobs.length,
    total: 0,
    settledTotal: 0,
    unsettledTotal: 0,
    byCategory: {},
  };
  for (const j of jobs) {
    summary.total += j.rate;
    if (j.settled) summary.settledTotal += j.rate;
    else summary.unsettledTotal += j.rate;

    if (!summary.byCategory[j.category]) {
      summary.byCategory[j.category] = { count: 0, total: 0 };
    }
    summary.byCategory[j.category].count += 1;
    summary.byCategory[j.category].total += j.rate;
  }
  return summary;
}

function setActiveTab(view) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

function switchView(view) {
  if (state.isAnimating) return;

  if (view === state.currentView) {
    document.querySelectorAll('.view').forEach(el => {
      el.hidden = el.id !== `view-${view}`;
    });
    setActiveTab(view);
    renderCurrentView();
    return;
  }

  const prevView = state.currentView;
  const oldEl = document.getElementById(`view-${prevView}`);
  const newEl = document.getElementById(`view-${view}`);
  const direction = VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(prevView) ? 1 : -1;

  state.currentView = view;
  setActiveTab(view);

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    oldEl.hidden = true;
    newEl.hidden = false;
    renderCurrentView();
    return;
  }

  newEl.hidden = false;
  renderCurrentView();

  const main = document.querySelector('main');
  const targetHeight = Math.max(oldEl.offsetHeight, newEl.offsetHeight);
  main.style.height = targetHeight + 'px';
  main.classList.add('view-transitioning');

  oldEl.classList.add('view-anim');
  newEl.classList.add('view-anim');
  oldEl.style.transition = 'none';
  newEl.style.transition = 'none';
  oldEl.style.transform = 'translateX(0)';
  newEl.style.transform = `translateX(${direction * 100}%)`;

  void newEl.offsetHeight; // force reflow so the 'none' transition + initial transform commit before animating

  state.isAnimating = true;

  requestAnimationFrame(() => {
    oldEl.style.transition = 'transform 240ms ease';
    newEl.style.transition = 'transform 240ms ease';
    oldEl.style.transform = `translateX(${-direction * 100}%)`;
    newEl.style.transform = 'translateX(0)';
  });

  const cleanup = () => {
    newEl.removeEventListener('transitionend', cleanup);
    oldEl.hidden = true;
    [oldEl, newEl].forEach((el) => {
      el.classList.remove('view-anim');
      el.style.transform = '';
      el.style.transition = '';
    });
    main.classList.remove('view-transitioning');
    main.style.height = '';
    state.isAnimating = false;
  };
  newEl.addEventListener('transitionend', cleanup);
}

function renderCurrentView() {
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'jobs') renderJobsView();
}

function renderCalendarToggleBtn() {
  document.getElementById('calendarToggleBtn').textContent =
    state.calendarVisible ? '달력 숨기기 ▲' : '달력 보기 ▼';
}

function renderCalendar() {
  renderCalendarToggleBtn();
  const grid = document.getElementById('calendarGrid');
  grid.hidden = !state.calendarVisible;
  if (!state.calendarVisible) return;

  const [year, month] = state.dashMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const today = todayStr();

  const jobsByDate = {};
  for (const job of state.jobs) {
    for (const d of jobDateRange(job)) {
      if (!jobsByDate[d]) jobsByDate[d] = [];
      jobsByDate[d].push(job);
    }
  }

  grid.innerHTML = '';
  for (const label of WEEKDAY_LABELS) {
    const el = document.createElement('div');
    el.className = 'calendar-weekday';
    el.textContent = label;
    grid.appendChild(el);
  }

  for (let i = 0; i < firstWeekday; i++) {
    const el = document.createElement('div');
    el.className = 'calendar-day is-empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayJobs = jobsByDate[dateStr] || [];
    const allSettled = dayJobs.length > 0 && dayJobs.every(j => j.settled);
    const hasUnsettled = dayJobs.some(j => !j.settled);

    const cell = document.createElement('div');
    cell.className = 'calendar-day' + (dateStr === today ? ' is-today' : '');

    const projectJob = dayJobs.find(j => j.projectColor);

    const badge = document.createElement('span');
    badge.className = 'daybadge';
    badge.textContent = String(day);

    if (projectJob) {
      badge.style.background = allSettled ? projectJob.projectColor : hexWithAlpha(projectJob.projectColor, '33');
      badge.style.color = allSettled ? contrastTextColor(projectJob.projectColor) : projectJob.projectColor;
    } else if (allSettled) {
      badge.classList.add('badge-settled');
    } else if (hasUnsettled) {
      badge.classList.add('badge-unsettled');
    }

    cell.appendChild(badge);

    if (dayJobs.length > 0) {
      cell.title = dayJobs.map(j => `${j.clientName} (${formatWon(j.rate)})`).join('\n');
    }

    grid.appendChild(cell);
  }
}

function renderDashboard() {
  document.getElementById('dashMonthLabel').textContent = formatMonthLabel(state.dashMonth);
  renderCalendar();
  const summary = computeSummary(state.dashMonth);

  document.getElementById('sumCount').textContent = `${summary.count}건`;
  document.getElementById('sumTotal').textContent = formatWon(summary.total);
  document.getElementById('sumSettled').textContent = formatWon(summary.settledTotal);
  document.getElementById('sumUnsettled').textContent = formatWon(summary.unsettledTotal);

  const breakdown = document.getElementById('categoryBreakdown');
  breakdown.innerHTML = '';
  const cats = Object.keys(summary.byCategory);
  if (cats.length === 0) {
    breakdown.innerHTML = '<div class="empty-state">이번 달 기록이 없습니다.</div>';
    return;
  }
  cats.sort((a, b) => summary.byCategory[b].total - summary.byCategory[a].total);
  for (const cat of cats) {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.dataset.category = cat;
    row.innerHTML = `<span class="cat-name">${cat}</span><span class="cat-stats">${summary.byCategory[cat].count}건 · ${formatWon(summary.byCategory[cat].total)}</span>`;
    breakdown.appendChild(row);
  }
}

function renderJobsView() {
  const showAll = state.showAllUnsettled;

  document.getElementById('jobsMonthNav').hidden = showAll;
  document.getElementById('filterSettled').hidden = showAll;
  document.getElementById('jobsMonthLabel').textContent = formatMonthLabel(state.jobsMonth);

  let jobs;
  if (showAll) {
    jobs = state.jobs.filter(j => !j.settled);
  } else {
    jobs = jobsInMonth(state.jobsMonth);
    if (state.filterSettled === 'settled') jobs = jobs.filter(j => j.settled);
    if (state.filterSettled === 'unsettled') jobs = jobs.filter(j => !j.settled);
  }
  if (state.filterCategory) jobs = jobs.filter(j => j.category === state.filterCategory);
  jobs.sort((a, b) => a.date.localeCompare(b.date));

  const summaryEl = document.getElementById('jobsSummary');
  if (showAll) {
    const total = jobs.reduce((sum, j) => sum + j.rate, 0);
    summaryEl.hidden = false;
    summaryEl.textContent = `전체 미정산 ${jobs.length}건 · 합계 ${formatWon(total)}`;
  } else {
    summaryEl.hidden = true;
  }

  const list = document.getElementById('jobList');
  list.innerHTML = '';
  if (jobs.length === 0) {
    list.innerHTML = '<div class="empty-state">해당 조건의 일정이 없습니다.</div>';
    return;
  }
  for (const job of jobs) {
    const row = document.createElement('div');
    row.className = 'job-row';

    const content = document.createElement('div');
    content.className = 'job-row-content';
    content.innerHTML = `
      <div class="job-row-top">
        <span><span class="badge" data-category="${job.category}">${job.category}</span><span class="badge ${job.settled ? 'badge-settled' : 'badge-unsettled'}">${job.settled ? '정산완료' : '미정산'}</span></span>
        <span class="job-rate">${formatWon(job.rate)}</span>
      </div>
      <div class="job-client">${escapeHtml(job.clientName)}</div>
      <div class="job-meta">${formatDateRange(job)}${job.assistants ? ' · 조수: ' + escapeHtml(job.assistants) : ''}</div>
    `;
    content.addEventListener('click', () => openJobModal(job.id));
    row.appendChild(content);

    if (!job.settled) {
      const quickBtn = document.createElement('button');
      quickBtn.type = 'button';
      quickBtn.className = 'quick-settle-btn';
      quickBtn.setAttribute('aria-label', '정산 완료로 표시');
      quickBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
      quickBtn.addEventListener('click', () => quickMarkSettled(job.id));
      row.appendChild(quickBtn);
    }

    list.appendChild(row);
  }
}

function quickMarkSettled(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  job.settled = true;
  job.settledDate = todayStr();
  saveJobs(state.jobs);
  renderCurrentView();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function populateCategoryFilter() {
  const sel = document.getElementById('filterCategory');
  for (const cat of CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  }
}

function openJobModal(jobId) {
  state.editingJobId = jobId || null;
  const job = jobId ? state.jobs.find(j => j.id === jobId) : null;

  document.getElementById('jobModalTitle').textContent = job ? '일정 수정' : '새 일정';
  document.getElementById('fDate').value = job ? job.date : todayStr();
  const isProject = !!(job && job.endDate);
  document.getElementById('fMultiDay').checked = isProject;
  document.getElementById('fEndDate').value = job && job.endDate ? job.endDate : '';
  document.getElementById('endDateRow').hidden = !isProject;
  document.getElementById('fProjectColor').value = (job && job.projectColor) || '#8C6BFF';
  document.getElementById('projectColorRow').hidden = !isProject;
  document.getElementById('fCategory').value = job ? job.category : '컨텐츠';
  document.getElementById('fClientName').value = job ? job.clientName : '';
  document.getElementById('fRate').value = job ? job.rate : '';
  document.getElementById('fAssistants').value = job ? job.assistants : '';
  document.getElementById('fMemo').value = job ? job.memo : '';
  document.getElementById('fSettled').checked = job ? job.settled : false;
  document.getElementById('fSettledDate').value = job && job.settledDate ? job.settledDate : todayStr();
  document.getElementById('settledDateRow').hidden = !(job ? job.settled : false);
  document.getElementById('deleteJobBtn').hidden = !job;

  document.getElementById('jobModal').hidden = false;
}

function closeJobModal() {
  document.getElementById('jobModal').hidden = true;
  state.editingJobId = null;
}

function handleJobFormSubmit(e) {
  e.preventDefault();
  const settled = document.getElementById('fSettled').checked;
  const existing = state.editingJobId ? state.jobs.find(j => j.id === state.editingJobId) : null;

  const date = document.getElementById('fDate').value;
  const isMultiDay = document.getElementById('fMultiDay').checked;
  const endDate = isMultiDay ? document.getElementById('fEndDate').value : null;
  const projectColor = isMultiDay ? document.getElementById('fProjectColor').value : null;

  if (isMultiDay && (!endDate || endDate < date)) {
    alert('종료일은 시작일과 같거나 이후여야 합니다.');
    return;
  }

  const jobData = {
    date,
    endDate,
    projectColor,
    category: document.getElementById('fCategory').value,
    clientName: document.getElementById('fClientName').value.trim(),
    rate: Number(document.getElementById('fRate').value) || 0,
    assistants: document.getElementById('fAssistants').value.trim(),
    memo: document.getElementById('fMemo').value.trim(),
    settled,
    settledDate: settled ? document.getElementById('fSettledDate').value : null,
  };

  if (existing) {
    Object.assign(existing, jobData);
  } else {
    state.jobs.push({
      id: uid(),
      source: 'manual',
      calendarUid: null,
      ...jobData,
    });
  }

  saveJobs(state.jobs);
  closeJobModal();
  renderCurrentView();
}

function handleDeleteJob() {
  if (!state.editingJobId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;
  state.jobs = state.jobs.filter(j => j.id !== state.editingJobId);
  saveJobs(state.jobs);
  closeJobModal();
  renderCurrentView();
}

// RFC 5545 unfolds continuation lines (leading space/tab) before field parsing.
function unfoldIcs(text) {
  return text.replace(/\r\n/g, '\n').split('\n').reduce((lines, line) => {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
    return lines;
  }, []);
}

function unescapeIcsText(str) {
  return (str || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(value) {
  const m = value.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function addDaysToDateStr(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIcsEvents(text) {
  const lines = unfoldIcs(text);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const rawKey = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = rawKey.split(';')[0].toUpperCase();
      if (key === 'UID') current.uid = value.trim();
      else if (key === 'SUMMARY') current.summary = unescapeIcsText(value);
      else if (key === 'DESCRIPTION') current.description = unescapeIcsText(value);
      else if (key === 'DTSTART') current.date = parseIcsDate(value);
      else if (key === 'DTEND') {
        current.dtend = parseIcsDate(value);
        current.dtendIsAllDay = rawKey.toUpperCase().includes('VALUE=DATE');
      }
    }
  }
  return events;
}

function parseJobFromEvent(event) {
  const summary = (event.summary || '').trim();
  const titleMatch = summary.match(/^\[(.+?)\]\s*(.*)$/);
  let category = '미분류';
  let clientName = summary;
  if (titleMatch) {
    const rawCat = titleMatch[1].trim();
    category = CATEGORIES.includes(rawCat) ? rawCat : '미분류';
    clientName = titleMatch[2].trim() || summary;
  }

  let rate = 0;
  let assistants = '';
  const desc = event.description || '';
  for (const line of desc.split('\n')) {
    const rateMatch = line.match(/^\s*단가\s*[:：]\s*(.+)$/);
    const assistMatch = line.match(/^\s*조수\s*[:：]\s*(.+)$/);
    if (rateMatch) {
      rate = Number(rateMatch[1].replace(/[^\d]/g, '')) || 0;
    } else if (assistMatch) {
      assistants = assistMatch[1].trim();
    }
  }

  const startDate = event.date || todayStr();
  let endDate = null;
  if (event.dtend) {
    // All-day DTEND is exclusive per RFC 5545 (the day after the last day), so
    // step it back one day to get the actual last shooting day.
    const lastDay = event.dtendIsAllDay ? addDaysToDateStr(event.dtend, -1) : event.dtend;
    if (lastDay > startDate) endDate = lastDay;
  }

  return {
    date: startDate,
    endDate,
    category,
    clientName: clientName || '(제목 없음)',
    rate,
    assistants,
    memo: desc,
    calendarUid: event.uid || null,
  };
}

function syncFromIcsText(text) {
  const events = parseIcsEvents(text);
  let added = 0, updated = 0;

  for (const event of events) {
    if (!event.uid) continue;
    const parsed = parseJobFromEvent(event);
    const existing = state.jobs.find(j => j.calendarUid === event.uid);
    if (existing) {
      Object.assign(existing, parsed);
      updated++;
    } else {
      state.jobs.push({
        id: uid(),
        source: 'calendar',
        settled: false,
        settledDate: null,
        ...parsed,
      });
      added++;
    }
  }

  saveJobs(state.jobs);
  return { added, updated, total: events.length };
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state.jobs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shooting-log-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    alert('올바른 JSON 파일이 아닙니다.');
    return;
  }
  if (!Array.isArray(data)) {
    alert('올바른 백업 파일 형식이 아닙니다.');
    return;
  }
  if (!confirm(`${data.length}건의 데이터를 가져옵니다. 기존 데이터는 모두 대체됩니다. 계속할까요?`)) return;
  state.jobs = data;
  saveJobs(state.jobs);
  renderCurrentView();
  alert('가져오기가 완료되었습니다.');
}

function initEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('calendarToggleBtn').addEventListener('click', () => {
    state.calendarVisible = !state.calendarVisible;
    localStorage.setItem(CALENDAR_VISIBLE_KEY, String(state.calendarVisible));
    renderCalendar();
  });

  document.getElementById('dashPrevMonth').addEventListener('click', () => {
    state.dashMonth = shiftMonth(state.dashMonth, -1);
    renderDashboard();
  });
  document.getElementById('dashNextMonth').addEventListener('click', () => {
    state.dashMonth = shiftMonth(state.dashMonth, 1);
    renderDashboard();
  });
  document.getElementById('jobsPrevMonth').addEventListener('click', () => {
    state.jobsMonth = shiftMonth(state.jobsMonth, -1);
    renderJobsView();
  });
  document.getElementById('jobsNextMonth').addEventListener('click', () => {
    state.jobsMonth = shiftMonth(state.jobsMonth, 1);
    renderJobsView();
  });

  document.getElementById('filterCategory').addEventListener('change', (e) => {
    state.filterCategory = e.target.value;
    renderJobsView();
  });
  document.getElementById('filterSettled').addEventListener('change', (e) => {
    state.filterSettled = e.target.value;
    renderJobsView();
  });
  document.getElementById('showAllUnsettled').addEventListener('change', (e) => {
    state.showAllUnsettled = e.target.checked;
    renderJobsView();
  });

  document.getElementById('addJobBtn').addEventListener('click', () => openJobModal(null));
  document.getElementById('cancelJobBtn').addEventListener('click', closeJobModal);
  document.getElementById('deleteJobBtn').addEventListener('click', handleDeleteJob);
  document.getElementById('jobForm').addEventListener('submit', handleJobFormSubmit);
  document.getElementById('fSettled').addEventListener('change', (e) => {
    document.getElementById('settledDateRow').hidden = !e.target.checked;
  });
  document.getElementById('fMultiDay').addEventListener('change', (e) => {
    document.getElementById('endDateRow').hidden = !e.target.checked;
    document.getElementById('projectColorRow').hidden = !e.target.checked;
  });

  document.getElementById('icsUploadBtn').addEventListener('click', () => {
    document.getElementById('icsFileInput').click();
  });
  document.getElementById('icsFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = syncFromIcsText(reader.result);
      document.getElementById('syncResult').textContent =
        `동기화 완료: 총 ${result.total}건 중 신규 ${result.added}건 추가, ${result.updated}건 갱신됨.`;
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importBackup(reader.result);
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('정말 모든 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    state.jobs = [];
    saveJobs(state.jobs);
    renderCurrentView();
  });

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    renderCurrentView();
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem(THEME_KEY)) return;
      applyTheme(e.matches ? 'dark' : 'light');
      renderCurrentView();
    });
  }
}

function initSwipeNavigation() {
  const main = document.querySelector('main');
  let startX = 0;
  let startY = 0;
  let tracking = false;

  main.addEventListener('touchstart', (e) => {
    if (!document.getElementById('jobModal').hidden || e.touches.length !== 1) {
      tracking = false;
      return;
    }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const idx = VIEW_ORDER.indexOf(state.currentView);
    if (dx < 0 && idx < VIEW_ORDER.length - 1) switchView(VIEW_ORDER[idx + 1]);
    else if (dx > 0 && idx > 0) switchView(VIEW_ORDER[idx - 1]);
  }, { passive: true });
}

function init() {
  applyTheme(state.theme);
  populateCategoryFilter();
  initEventListeners();
  initSwipeNavigation();
  switchView('dashboard');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
