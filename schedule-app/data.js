const STORAGE_KEY = 'schedule_app_data';

const DEFAULT_DATA = {
  version: 1,
  sites: [],
  employees: [],
  mobile: [],
  leaves: {},
  schedules: {}
};

function uid() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const Data = {
  state: null,

  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.state = Object.assign(structuredClone(DEFAULT_DATA), JSON.parse(raw));
      } catch {
        this.state = structuredClone(DEFAULT_DATA);
      }
    } else {
      this.state = structuredClone(DEFAULT_DATA);
    }
    this._migrate();
  },

  _migrate() {
    const v = this.state.version || 1;
    let changed = false;
    if (v < 2) {
      const conv = s => s === '早' ? '日' : s === '晚' ? '夜' : s;
      for (const e of this.state.employees) {
        if (e.shift === '早' || e.shift === '晚') { e.shift = conv(e.shift); changed = true; }
      }
      for (const m of this.state.mobile) {
        if (Array.isArray(m.shifts)) {
          const before = m.shifts.join(',');
          m.shifts = m.shifts.map(conv);
          if (m.shifts.join(',') !== before) changed = true;
        }
      }
      for (const ym in this.state.schedules) {
        const sch = this.state.schedules[ym];
        if (sch?.byDay) {
          for (const day in sch.byDay) {
            const slots = sch.byDay[day];
            if ('早' in slots) { slots['日'] = slots['早']; delete slots['早']; changed = true; }
            if ('晚' in slots) { slots['夜'] = slots['晚']; delete slots['晚']; changed = true; }
          }
        }
        if (sch?.mobileBusy) {
          for (const day in sch.mobileBusy) {
            for (const mid in sch.mobileBusy[day]) {
              const a = sch.mobileBusy[day][mid];
              if (a?.shift === '早') { a.shift = '日'; changed = true; }
              if (a?.shift === '晚') { a.shift = '夜'; changed = true; }
            }
          }
        }
        if (sch?.conflicts) {
          for (const c of sch.conflicts) {
            if (c.shift === '早') { c.shift = '日'; changed = true; }
            if (c.shift === '晚') { c.shift = '夜'; changed = true; }
          }
        }
      }
      this.state.version = 2;
      changed = true;
    }
    if (changed) this.persist();
  },

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  },

  sites() { return this.state.sites; },
  employees() { return this.state.employees; },
  mobile() { return this.state.mobile; },

  getSite(id) { return this.state.sites.find(s => s.id === id); },
  getEmployee(id) { return this.state.employees.find(e => e.id === id); },
  getMobile(id) { return this.state.mobile.find(m => m.id === id); },

  addSite(data) {
    const site = { id: uid(), ...data };
    this.state.sites.push(site);
    this.persist();
    return site;
  },
  updateSite(id, data) {
    const site = this.getSite(id);
    if (site) { Object.assign(site, data); this.persist(); }
  },
  deleteSite(id) {
    const removedEmps = this.state.employees.filter(e => e.siteId === id).map(e => e.id);
    this.state.sites = this.state.sites.filter(s => s.id !== id);
    this.state.employees = this.state.employees.filter(e => e.siteId !== id);
    removedEmps.forEach(eid => this._cleanupLeaves(eid));
    this.persist();
  },

  addEmployee(data) {
    const emp = { id: uid(), active: true, ...data };
    this.state.employees.push(emp);
    this.persist();
    return emp;
  },
  updateEmployee(id, data) {
    const emp = this.getEmployee(id);
    if (emp) { Object.assign(emp, data); this.persist(); }
  },
  deleteEmployee(id) {
    this.state.employees = this.state.employees.filter(e => e.id !== id);
    this._cleanupLeaves(id);
    this.persist();
  },

  addMobile(data) {
    const m = { id: uid(), active: true, ...data };
    this.state.mobile.push(m);
    this.persist();
    return m;
  },
  updateMobile(id, data) {
    const m = this.getMobile(id);
    if (m) { Object.assign(m, data); this.persist(); }
  },
  deleteMobile(id) {
    this.state.mobile = this.state.mobile.filter(m => m.id !== id);
    this._cleanupLeaves(id);
    this.persist();
  },

  getPersonLeaves(yearMonth, personId) {
    const month = this.state.leaves[yearMonth] || {};
    return month[personId] || { mandatory: [], preferred: [] };
  },
  setPersonLeaves(yearMonth, personId, leaves) {
    if (!this.state.leaves[yearMonth]) this.state.leaves[yearMonth] = {};
    this.state.leaves[yearMonth][personId] = leaves;
    this.persist();
  },
  _cleanupLeaves(personId) {
    for (const ym in this.state.leaves) {
      if (this.state.leaves[ym][personId]) delete this.state.leaves[ym][personId];
    }
  },

  getSchedule(yearMonth) {
    return this.state.schedules[yearMonth] || null;
  },
  setSchedule(yearMonth, schedule) {
    this.state.schedules[yearMonth] = schedule;
    this.persist();
  },
  deleteSchedule(yearMonth) {
    delete this.state.schedules[yearMonth];
    this.persist();
  },

  exportJson() {
    return JSON.stringify(this.state, null, 2);
  },
  importJson(json) {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || !parsed) throw new Error('資料格式錯誤');
    this.state = Object.assign(structuredClone(DEFAULT_DATA), parsed);
    this.persist();
  },
  reset() {
    this.state = structuredClone(DEFAULT_DATA);
    this.persist();
  },

  storageSize() {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    return new Blob([raw]).size;
  }
};

Data.init();
