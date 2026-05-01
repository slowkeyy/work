const ScheduleState = {
  yearMonth: null,
};

function getScheduleYM() {
  if (!ScheduleState.yearMonth) ScheduleState.yearMonth = getCurrentYearMonth();
  return ScheduleState.yearMonth;
}

// ===== 演算法 =====

function runScheduler(yearMonth) {
  const { year, month } = parseYearMonth(yearMonth);
  const days = daysInMonth(year, month);
  const sites = Data.sites();
  const employees = Data.employees();
  const mobile = Data.mobile();

  const leaveTypeOn = (personId, day) => {
    const l = Data.getPersonLeaves(yearMonth, personId);
    if ((l.mandatory || []).includes(day)) return 'mandatory';
    if ((l.preferred || []).includes(day)) return 'preferred';
    return null;
  };

  const byDay = {};
  for (let d = 1; d <= days; d++) {
    byDay[d] = { '早': {}, '晚': {} };
    for (const site of sites) {
      byDay[d]['早'][site.id] = [];
      byDay[d]['晚'][site.id] = [];
    }
  }

  for (const e of employees) {
    if (!Data.getSite(e.siteId)) continue;
    for (let d = 1; d <= days; d++) {
      if (leaveTypeOn(e.id, d) !== 'mandatory') {
        byDay[d][e.shift][e.siteId].push(e.id);
      }
    }
  }

  const mobileBusy = {};
  for (let d = 1; d <= days; d++) mobileBusy[d] = {};

  const denied = [];
  const conflicts = [];

  const pickMobile = (day, shift, allowPreferredOverride) => {
    let candidate = mobile.find(m =>
      (m.shifts || []).includes(shift) &&
      !mobileBusy[day][m.id] &&
      leaveTypeOn(m.id, day) === null
    );
    if (candidate) return { mobile: candidate, overridePreferred: false };
    if (!allowPreferredOverride) return null;
    candidate = mobile.find(m =>
      (m.shifts || []).includes(shift) &&
      !mobileBusy[day][m.id] &&
      leaveTypeOn(m.id, day) === 'preferred'
    );
    if (candidate) return { mobile: candidate, overridePreferred: true };
    return null;
  };

  // Step 1: 補必休造成的人力缺口
  for (let d = 1; d <= days; d++) {
    for (const shift of ['早', '晚']) {
      for (const site of sites) {
        const min = shift === '早' ? site.morningMin : site.eveningMin;
        let current = byDay[d][shift][site.id].length;
        while (current < min) {
          const pick = pickMobile(d, shift, true);
          if (!pick) {
            conflicts.push({
              day: d, shift, siteId: site.id,
              need: min, have: current,
            });
            break;
          }
          byDay[d][shift][site.id].push(pick.mobile.id);
          mobileBusy[d][pick.mobile.id] = { siteId: site.id, shift };
          if (pick.overridePreferred) {
            denied.push({ personId: pick.mobile.id, day: d, reason: 'mandatory_fill' });
          }
          current++;
        }
      }
    }
  }

  // Step 2: 嘗試准員工偏好假
  for (const e of employees) {
    if (!Data.getSite(e.siteId)) continue;
    const leaves = Data.getPersonLeaves(yearMonth, e.id);
    for (const day of (leaves.preferred || [])) {
      const list = byDay[day]?.[e.shift]?.[e.siteId];
      if (!list) continue;
      const idx = list.indexOf(e.id);
      if (idx === -1) continue;

      list.splice(idx, 1);
      const site = Data.getSite(e.siteId);
      const min = e.shift === '早' ? site.morningMin : site.eveningMin;

      if (list.length >= min) continue;

      const pick = pickMobile(day, e.shift, false);
      if (pick) {
        list.push(pick.mobile.id);
        mobileBusy[day][pick.mobile.id] = { siteId: e.siteId, shift: e.shift };
      } else {
        list.splice(idx, 0, e.id);
        denied.push({ personId: e.id, day, reason: 'preferred_unavailable' });
      }
    }
  }

  return {
    byDay,
    conflicts,
    denied,
    mobileBusy,
    generatedAt: new Date().toISOString(),
  };
}

// ===== UI =====

function renderSchedulePage() {
  const ym = getScheduleYM();
  const monthInput = document.getElementById('scheduleMonth');
  if (monthInput) monthInput.value = ym;
  renderScheduleHeader();
  renderScheduleMatrix();
  renderScheduleIssues();
}

function renderScheduleHeader() {
  const info = document.getElementById('scheduleInfo');
  if (!info) return;
  const ym = getScheduleYM();
  const schedule = Data.getSchedule(ym);
  const { year, month } = parseYearMonth(ym);
  const days = daysInMonth(year, month);
  const monthType = days === 31 ? '大月' : '小月';

  if (schedule) {
    const t = new Date(schedule.generatedAt).toLocaleString('zh-TW');
    info.innerHTML = `${monthType} · 共 ${days} 天 · 上次產生:${esc(t)}`;
  } else {
    info.textContent = `${monthType} · 共 ${days} 天 · 尚未產生班表`;
  }
}

function renderScheduleMatrix() {
  const container = document.getElementById('scheduleMatrix');
  if (!container) return;
  const ym = getScheduleYM();
  const schedule = Data.getSchedule(ym);

  if (!schedule) {
    container.innerHTML = '<div class="empty" style="padding:40px; margin:20px;">尚未產生班表 — 請按上方「⚡ 產生班表」</div>';
    return;
  }

  const { year, month } = parseYearMonth(ym);
  const days = daysInMonth(year, month);
  const sites = Data.sites();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dowLabels = ['日', '一', '二', '三', '四', '五', '六'];

  const rows = [];
  for (const site of sites) {
    if (site.morningCap > 0) rows.push({ site, shift: '早', min: site.morningMin });
    if (site.eveningCap > 0) rows.push({ site, shift: '晚', min: site.eveningMin });
  }

  if (rows.length === 0) {
    container.innerHTML = '<div class="empty" style="padding:40px; margin:20px;">沒有有效的案場/班別配置</div>';
    return;
  }

  let html = '<table class="schedule-table"><thead><tr>';
  html += '<th class="sticky-col">案場 / 班別</th>';
  for (let d = 1; d <= days; d++) {
    const dow = (firstDow + d - 1) % 7;
    const dowCls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
    html += `<th class="day-col ${dowCls}"><div class="day-num">${d}</div><div class="dow">${dowLabels[dow]}</div></th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    const shiftCls = row.shift === '早' ? 'morning' : 'evening';
    html += `<tr><td class="sticky-col">
      <div class="row-label">${esc(row.site.name)}</div>
      <span class="shift-badge ${shiftCls}">${row.shift}班</span>
      <span class="min-info">最低 ${row.min}</span>
    </td>`;
    for (let d = 1; d <= days; d++) {
      const personIds = schedule.byDay[d]?.[row.shift]?.[row.site.id] || [];
      const understaffed = personIds.length < row.min;
      const dow = (firstDow + d - 1) % 7;
      const dowCls = dow === 0 ? 'cell-sun' : dow === 6 ? 'cell-sat' : '';
      let cls = `day-cell ${dowCls}`;
      if (understaffed) cls += ' understaffed';
      const cellHtml = personIds.map(pid => {
        const m = Data.getMobile(pid);
        if (m) return `<span class="cell-name mobile">${esc(m.name)}</span>`;
        const e = Data.getEmployee(pid);
        return `<span class="cell-name">${esc(e?.name || '?')}</span>`;
      }).join('');
      html += `<td class="${cls}">${cellHtml || '<span class="cell-empty">—</span>'}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderScheduleIssues() {
  const container = document.getElementById('scheduleIssues');
  if (!container) return;
  const ym = getScheduleYM();
  const schedule = Data.getSchedule(ym);

  if (!schedule) {
    container.innerHTML = '';
    return;
  }

  const { conflicts, denied } = schedule;
  const empDenied = denied.filter(d => d.reason === 'preferred_unavailable');
  const mobOverride = denied.filter(d => d.reason === 'mandatory_fill');

  if (conflicts.length === 0 && empDenied.length === 0 && mobOverride.length === 0) {
    container.innerHTML = '<div class="issue-panel ok">✅ 完美:所有必休都被滿足、所有偏好都被滿足、沒有缺人問題</div>';
    return;
  }

  let html = '';

  if (conflicts.length > 0) {
    html += `<div class="issue-panel error"><h4>⚠️ 缺人問題（${conflicts.length} 件）— 必須手動處理</h4><ul>`;
    for (const c of conflicts) {
      const site = Data.getSite(c.siteId);
      html += `<li>${c.day} 日 ${c.shift}班 · ${esc(site?.name || '?')} — 需要 ${c.need} 人,目前只有 ${c.have} 人</li>`;
    }
    html += '</ul></div>';
  }

  if (empDenied.length > 0) {
    html += `<div class="issue-panel warn"><h4>📋 員工偏好假未能滿足（${empDenied.length} 件）</h4><ul>`;
    for (const d of empDenied) {
      const emp = Data.getEmployee(d.personId);
      html += `<li>${esc(emp?.name || '?')} — ${d.day} 日</li>`;
    }
    html += '</ul></div>';
  }

  if (mobOverride.length > 0) {
    html += `<div class="issue-panel info"><h4>🔄 機動偏好假被使用（${mobOverride.length} 件）</h4><ul>`;
    for (const d of mobOverride) {
      const m = Data.getMobile(d.personId);
      html += `<li>${esc(m?.name || '?')} — ${d.day} 日(被調去補必休缺口)</li>`;
    }
    html += '</ul></div>';
  }

  container.innerHTML = html;
}

// ===== CSV 匯出 =====

function csvCell(s) {
  s = String(s ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function exportScheduleCSV() {
  const ym = getScheduleYM();
  const schedule = Data.getSchedule(ym);
  if (!schedule) {
    alert('尚未產生班表,請先按「產生班表」');
    return;
  }

  const { year, month } = parseYearMonth(ym);
  const days = daysInMonth(year, month);
  const sites = Data.sites();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dowLabels = ['日', '一', '二', '三', '四', '五', '六'];

  const lines = [];
  const header = ['案場 / 班別'];
  for (let d = 1; d <= days; d++) {
    const dow = dowLabels[(firstDow + d - 1) % 7];
    header.push(`${d} (${dow})`);
  }
  lines.push(header.map(csvCell).join(','));

  for (const site of sites) {
    for (const shift of ['早', '晚']) {
      const cap = shift === '早' ? site.morningCap : site.eveningCap;
      if (cap === 0) continue;
      const row = [`${site.name} ${shift}班`];
      for (let d = 1; d <= days; d++) {
        const personIds = schedule.byDay[d]?.[shift]?.[site.id] || [];
        const names = personIds.map(pid => {
          const m = Data.getMobile(pid);
          if (m) return `${m.name}(機)`;
          const e = Data.getEmployee(pid);
          return e?.name || '?';
        });
        row.push(names.join(' / '));
      }
      lines.push(row.map(csvCell).join(','));
    }
  }

  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `班表_${ym}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===== 初始化 =====

function initSchedulePage() {
  if (!ScheduleState.yearMonth) ScheduleState.yearMonth = getCurrentYearMonth();

  const monthInput = document.getElementById('scheduleMonth');
  if (monthInput && !monthInput._inited) {
    monthInput.value = ScheduleState.yearMonth;
    monthInput.onchange = (e) => {
      if (!e.target.value) return;
      ScheduleState.yearMonth = e.target.value;
      renderSchedulePage();
    };
    monthInput._inited = true;
  }

  const generateBtn = document.getElementById('generateScheduleBtn');
  if (generateBtn && !generateBtn._inited) {
    generateBtn.onclick = () => {
      const ym = getScheduleYM();
      if (Data.sites().length === 0) { alert('請先在「設定」頁新增案場'); return; }
      if (Data.employees().length === 0) { alert('請先在「設定」頁新增員工'); return; }
      const result = runScheduler(ym);
      Data.setSchedule(ym, result);
      renderSchedulePage();
    };
    generateBtn._inited = true;
  }

  const exportBtn = document.getElementById('exportScheduleBtn');
  if (exportBtn && !exportBtn._inited) {
    exportBtn.onclick = exportScheduleCSV;
    exportBtn._inited = true;
  }

  const clearBtn = document.getElementById('clearScheduleBtn');
  if (clearBtn && !clearBtn._inited) {
    clearBtn.onclick = () => {
      if (!Data.getSchedule(getScheduleYM())) { alert('這個月還沒有班表'); return; }
      if (!confirm('確定要清除這個月的班表?')) return;
      Data.deleteSchedule(getScheduleYM());
      renderSchedulePage();
    };
    clearBtn._inited = true;
  }

  renderSchedulePage();
}
