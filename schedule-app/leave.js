const LeaveState = {
  yearMonth: null,
  selectedPersonId: null,
};

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(ym) {
  const [year, month] = ym.split('-').map(Number);
  return { year, month };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function requiredOffDays(year, month) {
  return daysInMonth(year, month) === 31 ? 7 : 6;
}

function leaveStatus(yearMonth, personId) {
  const { year, month } = parseYearMonth(yearMonth);
  const target = requiredOffDays(year, month);
  const leaves = Data.getPersonLeaves(yearMonth, personId);
  const m = (leaves.mandatory || []).length;
  const p = (leaves.preferred || []).length;
  const total = m + p;
  let icon = '⚠️';
  if (total === 0) icon = '⏳';
  else if (total === target && m === 2) icon = '✅';
  return { mandatory: m, preferred: p, total, target, icon, ok: total === target && m === 2 };
}

function renderLeaveSidebar() {
  const ym = LeaveState.yearMonth;
  const sidebar = document.getElementById('leaveSidebar');
  if (!sidebar) return;

  const sites = Data.sites();
  const employees = Data.employees();
  const mobile = Data.mobile();

  if (employees.length === 0 && mobile.length === 0) {
    sidebar.innerHTML = '<div class="empty">請先到「設定」頁新增員工或機動人員</div>';
    return;
  }

  let html = '';

  for (const site of sites) {
    const morning = employees.filter(e => e.siteId === site.id && e.shift === '早');
    const evening = employees.filter(e => e.siteId === site.id && e.shift === '晚');
    if (morning.length === 0 && evening.length === 0) continue;

    html += `<div class="leave-group">
      <div class="leave-group-title">${esc(site.name)}</div>`;

    if (morning.length > 0) {
      html += `<div class="leave-subgroup-title">早班</div>`;
      morning.forEach(e => { html += renderPersonRow(e.id, e.name, ym); });
    }
    if (evening.length > 0) {
      html += `<div class="leave-subgroup-title">晚班</div>`;
      evening.forEach(e => { html += renderPersonRow(e.id, e.name, ym); });
    }
    html += `</div>`;
  }

  if (mobile.length > 0) {
    html += `<div class="leave-group">
      <div class="leave-group-title">機動人員</div>`;
    mobile.forEach(m => { html += renderPersonRow(m.id, m.name, ym); });
    html += `</div>`;
  }

  sidebar.innerHTML = html;
}

function renderPersonRow(personId, name, ym) {
  const status = leaveStatus(ym, personId);
  const active = personId === LeaveState.selectedPersonId ? 'active' : '';
  return `
    <div class="leave-person ${active}" data-person-id="${personId}">
      <span class="leave-person-icon">${status.icon}</span>
      <span class="leave-person-name">${esc(name)}</span>
      <span class="leave-person-count">${status.total}/${status.target}</span>
    </div>
  `;
}

function renderLeaveDetail() {
  const detail = document.getElementById('leaveDetail');
  if (!detail) return;

  const ym = LeaveState.yearMonth;
  const personId = LeaveState.selectedPersonId;

  if (!personId) {
    detail.innerHTML = '<div class="empty" style="padding:60px 16px;">← 請從左側選擇一位人員開始輸入休假</div>';
    return;
  }

  const emp = Data.getEmployee(personId);
  const mob = Data.getMobile(personId);

  let header = '';
  if (emp) {
    const site = Data.getSite(emp.siteId);
    const shiftCls = emp.shift === '早' ? 'morning' : 'evening';
    header = `<h3>${esc(emp.name)}
      <span class="leave-detail-meta">${esc(site?.name || '')} · <span class="shift-badge ${shiftCls}">${emp.shift}班</span></span>
    </h3>`;
  } else if (mob) {
    header = `<h3>${esc(mob.name)} <span class="leave-detail-meta">機動人員</span></h3>`;
  } else {
    detail.innerHTML = '<div class="empty">人員不存在</div>';
    return;
  }

  const { year, month } = parseYearMonth(ym);
  const status = leaveStatus(ym, personId);
  const target = status.target;
  const leaves = Data.getPersonLeaves(ym, personId);

  const statusBadge = status.ok
    ? `<span class="status-badge ok">✅ 完成</span>`
    : status.total === 0
      ? `<span class="status-badge warn">⏳ 尚未填寫</span>`
      : `<span class="status-badge warn">⚠️ 尚未完成</span>`;

  detail.innerHTML = `
    ${header}
    <div class="leave-detail-summary">
      <span>${year} 年 ${month} 月 · 共 ${daysInMonth(year, month)} 天 · 應休 ${target} 天</span>
      ${statusBadge}
    </div>
    <div class="leave-summary-grid">
      <div class="summary-cell">
        <span class="summary-label">必休</span>
        <span class="summary-value ${status.mandatory === 2 ? 'ok' : 'warn'}">${status.mandatory} / 2</span>
      </div>
      <div class="summary-cell">
        <span class="summary-label">偏好</span>
        <span class="summary-value ${status.preferred === target - 2 ? 'ok' : 'warn'}">${status.preferred} / ${target - 2}</span>
      </div>
      <div class="summary-cell">
        <span class="summary-label">總計</span>
        <span class="summary-value ${status.total === target ? 'ok' : 'warn'}">${status.total} / ${target}</span>
      </div>
    </div>
    <div class="calendar-hint">
      點日期切換:
      <span class="cell-demo none">無</span>
      <span class="arrow">→</span>
      <span class="cell-demo mandatory">必休</span>
      <span class="arrow">→</span>
      <span class="cell-demo preferred">偏好</span>
      <span class="arrow">→</span>
      <span class="cell-demo none">無</span>
    </div>
    ${renderCalendar(year, month, leaves)}
    <div class="btn-group">
      <button class="btn btn-danger btn-sm" id="clearLeavesBtn">清空此人本月休假</button>
    </div>
  `;

  const clearBtn = document.getElementById('clearLeavesBtn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (!confirm('確定要清空此人本月所有休假?')) return;
      Data.setPersonLeaves(ym, personId, { mandatory: [], preferred: [] });
      renderLeavePage();
    };
  }
}

function renderCalendar(year, month, leaves) {
  const days = daysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const mandSet = new Set(leaves.mandatory || []);
  const prefSet = new Set(leaves.preferred || []);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  let html = `<div class="calendar">
    <div class="calendar-header">
      <div class="sun">日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div class="sat">六</div>
    </div>
    <div class="calendar-grid">`;

  for (let i = 0; i < firstDayOfWeek; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  for (let d = 1; d <= days; d++) {
    let cls = 'calendar-cell';
    if (mandSet.has(d)) cls += ' mandatory';
    else if (prefSet.has(d)) cls += ' preferred';
    if (d === todayDate) cls += ' today';

    const dayOfWeek = (firstDayOfWeek + d - 1) % 7;
    if (dayOfWeek === 0) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';

    html += `<div class="${cls}" data-day="${d}">${d}</div>`;
  }

  html += `</div></div>`;
  return html;
}

function cycleDayState(day) {
  const ym = LeaveState.yearMonth;
  const personId = LeaveState.selectedPersonId;
  if (!ym || !personId) return;

  const { year, month } = parseYearMonth(ym);
  const target = requiredOffDays(year, month);

  const leaves = Data.getPersonLeaves(ym, personId);
  const mand = new Set(leaves.mandatory || []);
  const pref = new Set(leaves.preferred || []);

  if (mand.has(day)) {
    mand.delete(day);
    pref.add(day);
  } else if (pref.has(day)) {
    pref.delete(day);
  } else {
    if (mand.size + pref.size >= target) {
      alert(`已達應休天數上限 ${target} 天,請先取消其他日期`);
      return;
    }
    if (mand.size < 2) mand.add(day);
    else pref.add(day);
  }

  Data.setPersonLeaves(ym, personId, {
    mandatory: [...mand].sort((a, b) => a - b),
    preferred: [...pref].sort((a, b) => a - b),
  });

  renderLeaveDetail();
  renderLeaveSidebar();
}

function updateMonthInfo() {
  const info = document.getElementById('leaveMonthInfo');
  if (!info) return;
  const { year, month } = parseYearMonth(LeaveState.yearMonth);
  const days = daysInMonth(year, month);
  const target = requiredOffDays(year, month);
  const monthType = days === 31 ? '大月' : '小月';
  info.textContent = `${monthType} · 共 ${days} 天 · 每人應休 ${target} 天(必休 2 + 偏好 ${target - 2})`;
}

function initLeavePage() {
  if (!LeaveState.yearMonth) {
    LeaveState.yearMonth = getCurrentYearMonth();
  }

  const monthInput = document.getElementById('leaveMonth');
  if (monthInput && !monthInput._inited) {
    monthInput.value = LeaveState.yearMonth;
    monthInput.onchange = (e) => {
      if (!e.target.value) return;
      LeaveState.yearMonth = e.target.value;
      LeaveState.selectedPersonId = null;
      renderLeavePage();
    };
    monthInput._inited = true;
  }

  const sidebar = document.getElementById('leaveSidebar');
  if (sidebar && !sidebar._inited) {
    sidebar.addEventListener('click', (e) => {
      const row = e.target.closest('[data-person-id]');
      if (!row) return;
      LeaveState.selectedPersonId = row.dataset.personId;
      renderLeavePage();
    });
    sidebar._inited = true;
  }

  const detail = document.getElementById('leaveDetail');
  if (detail && !detail._inited) {
    detail.addEventListener('click', (e) => {
      const cell = e.target.closest('.calendar-cell[data-day]');
      if (!cell || cell.classList.contains('empty')) return;
      cycleDayState(+cell.dataset.day);
    });
    detail._inited = true;
  }

  renderLeavePage();
}

function renderLeavePage() {
  if (!LeaveState.yearMonth) LeaveState.yearMonth = getCurrentYearMonth();
  updateMonthInfo();
  renderLeaveSidebar();
  renderLeaveDetail();
}
