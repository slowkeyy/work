const ScheduleState = {
  yearMonth: null,
  selectedSiteId: null,
};

function getScheduleYM() {
  if (!ScheduleState.yearMonth) ScheduleState.yearMonth = getCurrentYearMonth();
  return ScheduleState.yearMonth;
}

function mobileShiftLabel(m) {
  const has日 = (m.shifts || []).includes('日');
  const has夜 = (m.shifts || []).includes('夜');
  if (has日 && !has夜) return '日機';
  if (has夜 && !has日) return '夜機';
  if (has日 && has夜) return '支援';
  return '機動';
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
    byDay[d] = { '日': {}, '夜': {} };
    for (const site of sites) {
      byDay[d]['日'][site.id] = [];
      byDay[d]['夜'][site.id] = [];
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
    for (const shift of ['日', '夜']) {
      for (const site of sites) {
        const min = shift === '日' ? site.morningMin : site.eveningMin;
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
      const min = e.shift === '日' ? site.morningMin : site.eveningMin;

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
  updateSiteSelector();
  renderScheduleHeader();
  renderScheduleMatrix();
  renderScheduleIssues();
}

function updateSiteSelector() {
  const sel = document.getElementById('scheduleSite');
  if (!sel) return;
  const sites = Data.sites();
  sel.innerHTML = sites.length === 0
    ? '<option value="">(沒有案場)</option>'
    : '<option value="">— 選擇案場 —</option>' +
      sites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  const validSelected = ScheduleState.selectedSiteId &&
    sites.some(s => s.id === ScheduleState.selectedSiteId);
  if (validSelected) {
    sel.value = ScheduleState.selectedSiteId;
  } else if (sites.length > 0) {
    sel.value = sites[0].id;
    ScheduleState.selectedSiteId = sites[0].id;
  } else {
    ScheduleState.selectedSiteId = null;
  }
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
    info.textContent = `${monthType} · 共 ${days} 天 · 上次產生:${t}`;
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

  const sites = Data.sites();
  if (sites.length === 0) {
    container.innerHTML = '<div class="empty" style="padding:40px; margin:20px;">沒有任何案場</div>';
    return;
  }

  const siteId = ScheduleState.selectedSiteId;
  const site = siteId ? Data.getSite(siteId) : null;

  if (!site) {
    container.innerHTML = '<div class="empty" style="padding:40px; margin:20px;">請從上方選擇要顯示的案場</div>';
    return;
  }

  container.innerHTML = renderSiteScheduleTable(site, schedule, ym);
}

function getSiteRowsAndCells(site, schedule, ym) {
  const { year, month } = parseYearMonth(ym);
  const days = daysInMonth(year, month);

  const employees = Data.employees().filter(e => e.siteId === site.id);
  const dayEmps = employees.filter(e => e.shift === '日');
  const nightEmps = employees.filter(e => e.shift === '夜');

  const mobileUsed = new Set();
  for (let d = 1; d <= days; d++) {
    for (const sh of ['日', '夜']) {
      const list = schedule.byDay[d]?.[sh]?.[site.id] || [];
      for (const pid of list) {
        if (Data.getMobile(pid)) mobileUsed.add(pid);
      }
    }
  }
  const mobiles = Data.mobile().filter(m => mobileUsed.has(m.id));
  mobiles.sort((a, b) => {
    const ord = (m) => {
      const has日 = (m.shifts || []).includes('日');
      const has夜 = (m.shifts || []).includes('夜');
      if (has日 && !has夜) return 0;
      if (has夜 && !has日) return 1;
      return 2;
    };
    return ord(a) - ord(b);
  });

  const rows = [];
  for (const e of dayEmps) rows.push({ id: e.id, name: e.name, label: '日班', type: 'emp' });
  for (const e of nightEmps) rows.push({ id: e.id, name: e.name, label: '夜班', type: 'emp' });
  for (const m of mobiles) rows.push({ id: m.id, name: m.name, label: mobileShiftLabel(m), type: 'mobile' });

  return rows;
}

function getCellShift(personId, day, siteId, schedule) {
  for (const sh of ['日', '夜']) {
    const list = schedule.byDay[day]?.[sh]?.[siteId] || [];
    if (list.includes(personId)) return sh;
  }
  return '';
}

function renderSiteScheduleTable(site, schedule, ym) {
  const { year, month } = parseYearMonth(ym);
  const days = daysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dowLabels = ['日', '一', '二', '三', '四', '五', '六'];

  const rows = getSiteRowsAndCells(site, schedule, ym);

  let html = `<div class="site-schedule">`;
  html += `<div class="site-schedule-title">${year} 年 ${month} 月（休息）班表</div>`;
  html += `<div class="site-schedule-meta">`;
  html += `<div><span class="meta-label">單位名稱</span><span class="meta-value">${esc(site.unitName || '—')}</span></div>`;
  html += `<div><span class="meta-label">現場名稱</span><span class="meta-value">${esc(site.name)}</span></div>`;
  html += `<div><span class="meta-label">現場地址</span><span class="meta-value">${esc(site.address || '—')}</span></div>`;
  html += `</div>`;

  if (rows.length === 0) {
    html += `<div class="empty" style="padding:30px; margin:20px;">這個案場本月沒有任何排班</div>`;
    html += `</div>`;
    return html;
  }

  html += `<div class="site-table-scroll"><table class="site-table"><thead>`;
  html += `<tr><th class="th-name" rowspan="2">姓名</th><th class="th-shift" rowspan="2">班別</th><th class="th-corner">日期</th>`;
  for (let d = 1; d <= days; d++) {
    const dow = (firstDow + d - 1) % 7;
    const cls = (dow === 0 || dow === 6) ? 'weekend' : '';
    html += `<th class="day-num ${cls}">${d}</th>`;
  }
  html += `</tr><tr><th class="th-corner">星期</th>`;
  for (let d = 1; d <= days; d++) {
    const dow = (firstDow + d - 1) % 7;
    const cls = (dow === 0 || dow === 6) ? 'weekend' : '';
    html += `<th class="dow-label ${cls}">${dowLabels[dow]}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const row of rows) {
    const nameCls = row.type === 'mobile' ? 'mobile-name' : '';
    html += `<tr><td class="td-name ${nameCls}">${esc(row.name)}</td>`;
    html += `<td class="td-shift">${row.label}</td>`;
    html += `<td class="td-corner"></td>`;
    for (let d = 1; d <= days; d++) {
      const dow = (firstDow + d - 1) % 7;
      const weekendCls = (dow === 0 || dow === 6) ? 'weekend' : '';
      const sh = getCellShift(row.id, d, site.id, schedule);
      let cls = `day-cell ${weekendCls}`;
      if (sh === '日') cls += ' day-shift';
      else if (sh === '夜') cls += ' night-shift';
      html += `<td class="${cls}">${sh}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
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
    alert('尚未產生班表,請先按「⚡ 產生班表」');
    return;
  }
  const siteId = ScheduleState.selectedSiteId;
  const site = siteId ? Data.getSite(siteId) : null;
  if (!site) {
    alert('請先選擇案場');
    return;
  }

  const { year, month } = parseYearMonth(ym);
  const days = daysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dowLabels = ['日', '一', '二', '三', '四', '五', '六'];

  const rows = getSiteRowsAndCells(site, schedule, ym);

  const lines = [];
  lines.push(csvCell(`${year} 年 ${month} 月（休息）班表`));
  lines.push([
    csvCell('單位名稱'), csvCell(site.unitName || ''),
    csvCell('現場名稱'), csvCell(site.name),
    csvCell('現場地址'), csvCell(site.address || ''),
  ].join(','));
  lines.push('');

  const h1 = ['姓名', '班別', '日期'];
  for (let d = 1; d <= days; d++) h1.push(String(d));
  lines.push(h1.map(csvCell).join(','));

  const h2 = ['', '', '星期'];
  for (let d = 1; d <= days; d++) {
    h2.push(dowLabels[(firstDow + d - 1) % 7]);
  }
  lines.push(h2.map(csvCell).join(','));

  for (const row of rows) {
    const r = [row.name, row.label, ''];
    for (let d = 1; d <= days; d++) {
      r.push(getCellShift(row.id, d, site.id, schedule));
    }
    lines.push(r.map(csvCell).join(','));
  }

  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${site.name}_班表_${ym}.csv`;
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

  const siteSelect = document.getElementById('scheduleSite');
  if (siteSelect && !siteSelect._inited) {
    siteSelect.onchange = (e) => {
      ScheduleState.selectedSiteId = e.target.value || null;
      renderScheduleMatrix();
    };
    siteSelect._inited = true;
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
