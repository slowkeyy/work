function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
      document.querySelectorAll('.tab-content').forEach(c =>
        c.classList.toggle('active', c.id === `tab-${tab}`));
      if (tab === 'backup') updateStorageInfo();
    });
  });
}

// ===== 案場 =====

function renderSites() {
  const list = document.getElementById('siteList');
  const sites = Data.sites();
  if (sites.length === 0) {
    list.innerHTML = '<div class="empty">尚未新增案場</div>';
    return;
  }
  list.innerHTML = sites.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-info">
        <div class="list-item-title">${esc(s.name)}</div>
        <div class="list-item-meta">
          早班 ${s.morningCap} 人(最低 ${s.morningMin}) · 晚班 ${s.eveningCap} 人(最低 ${s.eveningMin})
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm" data-action="edit-site" data-id="${s.id}">編輯</button>
        <button class="btn btn-sm btn-danger" data-action="delete-site" data-id="${s.id}">刪除</button>
      </div>
    </div>
  `).join('');
}

function siteFormHtml(data = {}) {
  return `
    <div class="list-item editing">
      <div class="form-row">
        <div class="form-field">
          <label>案場名稱</label>
          <input type="text" id="siteName" value="${esc(data.name || '')}" placeholder="例如 A 社區">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>早班編制</label>
          <input type="number" id="siteMorningCap" value="${data.morningCap ?? 1}" min="0">
        </div>
        <div class="form-field">
          <label>早班最低</label>
          <input type="number" id="siteMorningMin" value="${data.morningMin ?? 1}" min="0">
        </div>
        <div class="form-field">
          <label>晚班編制</label>
          <input type="number" id="siteEveningCap" value="${data.eveningCap ?? 1}" min="0">
        </div>
        <div class="form-field">
          <label>晚班最低</label>
          <input type="number" id="siteEveningMin" value="${data.eveningMin ?? 1}" min="0">
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" id="saveSiteBtn">儲存</button>
        <button class="btn" id="cancelSiteBtn">取消</button>
      </div>
    </div>
  `;
}

function readSiteForm() {
  return {
    name: document.getElementById('siteName').value.trim(),
    morningCap: +document.getElementById('siteMorningCap').value,
    morningMin: +document.getElementById('siteMorningMin').value,
    eveningCap: +document.getElementById('siteEveningCap').value,
    eveningMin: +document.getElementById('siteEveningMin').value,
  };
}

function validateSite(d) {
  if (!d.name) return '請輸入案場名稱';
  if (d.morningCap < 0 || d.eveningCap < 0) return '編制不可為負數';
  if (d.morningMin > d.morningCap) return '早班最低人數不可大於編制';
  if (d.eveningMin > d.eveningCap) return '晚班最低人數不可大於編制';
  return null;
}

function showAddSite() {
  renderSites();
  const list = document.getElementById('siteList');
  const div = document.createElement('div');
  div.innerHTML = siteFormHtml();
  const form = div.firstElementChild;
  list.prepend(form);
  document.getElementById('siteName').focus();
  document.getElementById('saveSiteBtn').onclick = () => {
    const d = readSiteForm();
    const err = validateSite(d);
    if (err) { alert(err); return; }
    Data.addSite(d);
    renderSites();
    renderEmployees();
  };
  document.getElementById('cancelSiteBtn').onclick = renderSites;
}

function showEditSite(id) {
  renderSites();
  const site = Data.getSite(id);
  if (!site) return;
  const item = document.querySelector(`#siteList [data-id="${id}"]`);
  const div = document.createElement('div');
  div.innerHTML = siteFormHtml(site);
  item.replaceWith(div.firstElementChild);
  document.getElementById('saveSiteBtn').onclick = () => {
    const d = readSiteForm();
    const err = validateSite(d);
    if (err) { alert(err); return; }
    Data.updateSite(id, d);
    renderSites();
    renderEmployees();
  };
  document.getElementById('cancelSiteBtn').onclick = renderSites;
}

function deleteSite(id) {
  const site = Data.getSite(id);
  if (!site) return;
  const empCount = Data.employees().filter(e => e.siteId === id).length;
  let msg = `確定刪除案場「${site.name}」?`;
  if (empCount > 0) msg += `\n\n此案場有 ${empCount} 位員工,將一併刪除。`;
  if (!confirm(msg)) return;
  Data.deleteSite(id);
  renderSites();
  renderEmployees();
}

// ===== 員工 =====

function renderEmployees() {
  const list = document.getElementById('employeeList');
  const employees = Data.employees();
  if (employees.length === 0) {
    list.innerHTML = '<div class="empty">尚未新增員工</div>';
    return;
  }
  list.innerHTML = employees.map(e => {
    const site = Data.getSite(e.siteId);
    const siteName = site ? site.name : '(案場不存在)';
    const cls = e.shift === '早' ? 'morning' : 'evening';
    return `
      <div class="list-item" data-id="${e.id}">
        <div class="list-item-info">
          <div class="list-item-title">${esc(e.name)}</div>
          <div class="list-item-meta">
            ${esc(siteName)} · <span class="shift-badge ${cls}">${e.shift}班</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm" data-action="edit-emp" data-id="${e.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete-emp" data-id="${e.id}">刪除</button>
        </div>
      </div>
    `;
  }).join('');
}

function employeeFormHtml(data = {}) {
  const sites = Data.sites();
  if (sites.length === 0) {
    return `
      <div class="list-item editing">
        <p class="hint">請先在「案場」區塊新增案場。</p>
        <div class="btn-group">
          <button class="btn" id="cancelEmpBtn">關閉</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="list-item editing">
      <div class="form-row">
        <div class="form-field">
          <label>姓名</label>
          <input type="text" id="empName" value="${esc(data.name || '')}">
        </div>
        <div class="form-field">
          <label>案場</label>
          <select id="empSite">
            ${sites.map(s => `<option value="${s.id}" ${data.siteId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>班別</label>
          <select id="empShift">
            <option value="早" ${data.shift === '早' ? 'selected' : ''}>早班</option>
            <option value="晚" ${data.shift === '晚' ? 'selected' : ''}>晚班</option>
          </select>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" id="saveEmpBtn">儲存</button>
        <button class="btn" id="cancelEmpBtn">取消</button>
      </div>
    </div>
  `;
}

function readEmpForm() {
  return {
    name: document.getElementById('empName').value.trim(),
    siteId: document.getElementById('empSite').value,
    shift: document.getElementById('empShift').value,
  };
}

function showAddEmployee() {
  renderEmployees();
  const list = document.getElementById('employeeList');
  const div = document.createElement('div');
  div.innerHTML = employeeFormHtml();
  list.prepend(div.firstElementChild);
  const nameInput = document.getElementById('empName');
  if (nameInput) nameInput.focus();
  const saveBtn = document.getElementById('saveEmpBtn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const d = readEmpForm();
      if (!d.name) { alert('請輸入姓名'); return; }
      Data.addEmployee(d);
      renderEmployees();
    };
  }
  document.getElementById('cancelEmpBtn').onclick = renderEmployees;
}

function showEditEmployee(id) {
  renderEmployees();
  const emp = Data.getEmployee(id);
  if (!emp) return;
  const item = document.querySelector(`#employeeList [data-id="${id}"]`);
  const div = document.createElement('div');
  div.innerHTML = employeeFormHtml(emp);
  item.replaceWith(div.firstElementChild);
  document.getElementById('saveEmpBtn').onclick = () => {
    const d = readEmpForm();
    if (!d.name) { alert('請輸入姓名'); return; }
    Data.updateEmployee(id, d);
    renderEmployees();
  };
  document.getElementById('cancelEmpBtn').onclick = renderEmployees;
}

function deleteEmployee(id) {
  const emp = Data.getEmployee(id);
  if (!emp) return;
  if (!confirm(`確定刪除員工「${emp.name}」?`)) return;
  Data.deleteEmployee(id);
  renderEmployees();
}

// ===== 機動人員 =====

function renderMobile() {
  const list = document.getElementById('mobileList');
  const mobile = Data.mobile();
  if (mobile.length === 0) {
    list.innerHTML = '<div class="empty">尚未新增機動人員</div>';
    return;
  }
  list.innerHTML = mobile.map(m => {
    const shifts = (m.shifts || []).map(s =>
      `<span class="shift-badge ${s === '早' ? 'morning' : 'evening'}">${s}班</span>`
    ).join('');
    return `
      <div class="list-item" data-id="${m.id}">
        <div class="list-item-info">
          <div class="list-item-title">${esc(m.name)}</div>
          <div class="list-item-meta">可支援:${shifts || '(未設定)'}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm" data-action="edit-mob" data-id="${m.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete-mob" data-id="${m.id}">刪除</button>
        </div>
      </div>
    `;
  }).join('');
}

function mobileFormHtml(data = {}) {
  const shifts = data.shifts || ['早', '晚'];
  return `
    <div class="list-item editing">
      <div class="form-row">
        <div class="form-field">
          <label>姓名</label>
          <input type="text" id="mobName" value="${esc(data.name || '')}">
        </div>
        <div class="form-field">
          <label>可支援班別</label>
          <div class="checkbox-group">
            <label><input type="checkbox" id="mobMorning" ${shifts.includes('早') ? 'checked' : ''}> 早班</label>
            <label><input type="checkbox" id="mobEvening" ${shifts.includes('晚') ? 'checked' : ''}> 晚班</label>
          </div>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" id="saveMobBtn">儲存</button>
        <button class="btn" id="cancelMobBtn">取消</button>
      </div>
    </div>
  `;
}

function readMobileForm() {
  const shifts = [];
  if (document.getElementById('mobMorning').checked) shifts.push('早');
  if (document.getElementById('mobEvening').checked) shifts.push('晚');
  return {
    name: document.getElementById('mobName').value.trim(),
    shifts
  };
}

function showAddMobile() {
  renderMobile();
  const list = document.getElementById('mobileList');
  const div = document.createElement('div');
  div.innerHTML = mobileFormHtml();
  list.prepend(div.firstElementChild);
  document.getElementById('mobName').focus();
  document.getElementById('saveMobBtn').onclick = () => {
    const d = readMobileForm();
    if (!d.name) { alert('請輸入姓名'); return; }
    if (d.shifts.length === 0) { alert('請至少勾選一個可支援班別'); return; }
    Data.addMobile(d);
    renderMobile();
  };
  document.getElementById('cancelMobBtn').onclick = renderMobile;
}

function showEditMobile(id) {
  renderMobile();
  const m = Data.getMobile(id);
  if (!m) return;
  const item = document.querySelector(`#mobileList [data-id="${id}"]`);
  const div = document.createElement('div');
  div.innerHTML = mobileFormHtml(m);
  item.replaceWith(div.firstElementChild);
  document.getElementById('saveMobBtn').onclick = () => {
    const d = readMobileForm();
    if (!d.name) { alert('請輸入姓名'); return; }
    if (d.shifts.length === 0) { alert('請至少勾選一個可支援班別'); return; }
    Data.updateMobile(id, d);
    renderMobile();
  };
  document.getElementById('cancelMobBtn').onclick = renderMobile;
}

function deleteMobile(id) {
  const m = Data.getMobile(id);
  if (!m) return;
  if (!confirm(`確定刪除機動人員「${m.name}」?`)) return;
  Data.deleteMobile(id);
  renderMobile();
}

// ===== 備份 =====

function setupBackup() {
  document.getElementById('exportBtn').onclick = () => {
    const json = Data.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `排班備份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('importBtn').onclick = () => {
    document.getElementById('importFile').click();
  };

  document.getElementById('importFile').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!confirm('匯入會覆蓋目前所有資料,確定?')) {
        e.target.value = '';
        return;
      }
      try {
        Data.importJson(reader.result);
        renderAll();
        updateStorageInfo();
        alert('匯入成功');
      } catch (err) {
        alert('匯入失敗:' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  document.getElementById('resetBtn').onclick = () => {
    if (!confirm('確定要清空所有資料?此操作無法復原。')) return;
    if (!confirm('真的要清空嗎?所有案場、員工、休假、班表都會消失。')) return;
    Data.reset();
    renderAll();
    updateStorageInfo();
  };
}

function updateStorageInfo() {
  const el = document.getElementById('storageInfo');
  if (!el) return;
  const bytes = Data.storageSize();
  const kb = (bytes / 1024).toFixed(2);
  const counts = `案場 ${Data.sites().length}・員工 ${Data.employees().length}・機動 ${Data.mobile().length}`;
  el.textContent = `目前儲存:${kb} KB ・ ${counts}`;
}

// ===== 事件委派 =====

function setupEventDelegation() {
  document.getElementById('siteList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-site') showEditSite(id);
    else if (btn.dataset.action === 'delete-site') deleteSite(id);
  });
  document.getElementById('employeeList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-emp') showEditEmployee(id);
    else if (btn.dataset.action === 'delete-emp') deleteEmployee(id);
  });
  document.getElementById('mobileList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-mob') showEditMobile(id);
    else if (btn.dataset.action === 'delete-mob') deleteMobile(id);
  });
}

function renderAll() {
  renderSites();
  renderEmployees();
  renderMobile();
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  document.getElementById('addSiteBtn').onclick = showAddSite;
  document.getElementById('addEmployeeBtn').onclick = showAddEmployee;
  document.getElementById('addMobileBtn').onclick = showAddMobile;
  setupBackup();
  setupEventDelegation();
  renderAll();
  updateStorageInfo();
});
