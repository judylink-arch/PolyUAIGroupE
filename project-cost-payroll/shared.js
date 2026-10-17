/* Shared helpers for Project Cost Payroll — no salary logic here */
(function (global) {
  const LEAVE_CODES = ["AL", "SL", "NPL", "PH", "OFF", "Admin", "CL"];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const STAFF_CHECK_SHEET = "Staff Check Summary";
  const UNITS_PREFIX = "Units: ";

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function monthBase(year, month) {
    return daysInMonth(year, month) * 2;
  }

  function monthAbbrev(month) {
    return MONTH_NAMES[month - 1].slice(0, 3).toUpperCase();
  }

  function periodLabel(year, month) {
    return MONTH_NAMES[month - 1] + " " + year;
  }

  function fileStamp(year, month) {
    return year + "-" + String(month).padStart(2, "0");
  }

  function analysisSheetName(year, month) {
    return String(year).slice(-2) + "-" + String(month).padStart(2, "0");
  }

  function emptyLeave() {
    return LEAVE_CODES.reduce((o, c) => { o[c] = 0; return o; }, {});
  }

  function leaveSum(person) {
    return LEAVE_CODES.reduce((s, c) => s + (Number(person.leave[c]) || 0), 0);
  }

  function projectSum(person, projects) {
    return projects.reduce((s, p) => s + (Number(person.projects[p.id]) || 0), 0);
  }

  function staffStatus(person, projects, year, month) {
    const base = monthBase(year, month);
    const leave = leaveSum(person);
    const denom = base - leave;
    const pUnits = projectSum(person, projects);
    return { base, leave, denom, pUnits, ok: denom === pUnits };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return "HKD " + Number(n).toLocaleString("en-HK", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    const src = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { row.push(cell); cell = ""; }
        else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
        else if (ch === "\r") { /* skip */ }
        else cell += ch;
      }
    }
    row.push(cell);
    if (row.some((c) => String(c).trim() !== "")) rows.push(row);
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  function headerIndex(headers, aliases) {
    const norm = headers.map((h) => String(h).trim().toLowerCase());
    for (const a of aliases) {
      const i = norm.indexOf(a.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  }

  function safeSheetName(sheetName) {
    return String(sheetName || "Sheet1").replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet1";
  }

  function ensureXlsx() {
    if (typeof XLSX === "undefined") {
      throw new Error("Excel library missing. Keep xlsx.full.min.js in this folder.");
    }
  }

  function downloadExcel(filename, sheetName, rows) {
    ensureXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeSheetName(sheetName));
    const name = filename.toLowerCase().endsWith(".xlsx") ? filename : filename + ".xlsx";
    XLSX.writeFile(wb, name, { bookType: "xlsx" });
  }

  function downloadExcelMulti(filename, sheets) {
    ensureXlsx();
    const wb = XLSX.utils.book_new();
    sheets.forEach((s, i) => {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(s.rows),
        safeSheetName(s.name || ("Sheet" + (i + 1)))
      );
    });
    const name = filename.toLowerCase().endsWith(".xlsx") ? filename : filename + ".xlsx";
    XLSX.writeFile(wb, name, { bookType: "xlsx" });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsText(file);
    });
  }

  /** Build Staff Check rows — never includes salary Y */
  function buildStaffCheckRows(staff, projects, year, month) {
    const header = [
      "Period", "Staff ID", "Employee Name", "Department",
      ...LEAVE_CODES,
      "Leave total", "Base", "Denom", "Project units", "Status",
      ...projects.map((p) => UNITS_PREFIX + p.name)
    ];
    const rows = [header];
    staff.forEach((p) => {
      const st = staffStatus(p, projects, year, month);
      rows.push([
        periodLabel(year, month),
        p.staffId,
        p.name,
        p.department,
        ...LEAVE_CODES.map((c) => Number(p.leave[c]) || 0),
        st.leave,
        st.base,
        st.denom,
        st.pUnits,
        st.ok ? "OK" : "ERROR: denom <> project units",
        ...projects.map((proj) => Number(p.projects[proj.id]) || 0)
      ]);
    });
    return rows;
  }

  /**
   * Parse HR1 Staff Check Summary.xlsx into { year, month, projects, staff }
   * Salary is never present in this file.
   */
  function parseStaffCheckWorkbook(arrayBuffer) {
    ensureXlsx();
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = wb.SheetNames.includes(STAFF_CHECK_SHEET)
      ? STAFF_CHECK_SHEET
      : wb.SheetNames[0];
    if (!sheetName) throw new Error("Staff Check file has no sheets.");
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    if (!aoa.length) throw new Error("Staff Check sheet is empty.");

    // Find header row containing Staff ID
    let headerRow = -1;
    for (let i = 0; i < Math.min(aoa.length, 10); i++) {
      const row = aoa[i].map((c) => String(c).trim().toLowerCase());
      if (row.includes("staff id") && row.includes("employee name")) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) throw new Error("Cannot find Staff Check header (need Staff ID, Employee Name).");

    const headers = aoa[headerRow].map((h) => String(h).trim());
    const iId = headerIndex(headers, ["staff id"]);
    const iName = headerIndex(headers, ["employee name", "name"]);
    const iDept = headerIndex(headers, ["department"]);
    const iPeriod = headerIndex(headers, ["period"]);
    const iDenom = headerIndex(headers, ["denom"]);
    const iBase = headerIndex(headers, ["base"]);
    if (iId < 0 || iName < 0) throw new Error("Staff Check header missing Staff ID or Employee Name.");

    const leaveIdx = {};
    LEAVE_CODES.forEach((c) => { leaveIdx[c] = headerIndex(headers, [c]); });

    const projectCols = [];
    headers.forEach((h, idx) => {
      if (h.startsWith(UNITS_PREFIX)) {
        projectCols.push({ idx, name: h.slice(UNITS_PREFIX.length).trim() });
      }
    });
    if (!projectCols.length) {
      throw new Error("No project unit columns found (expected headers like \"Units: Project Name\").");
    }

    const projects = projectCols.map((p, i) => ({ id: "P" + (i + 1), name: p.name }));
    const nameToId = {};
    projects.forEach((p) => { nameToId[p.name] = p.id; });

    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;

    const SKIP_LABELS = new Set([
      "handoff note", "staff count", "record summary", "base", "period",
      "give this file to hr2 only. contains no salary.", "notes", "note"
    ]);

    function isMetaRow(staffId, name, periodVal, deptVal) {
      const idL = String(staffId).trim().toLowerCase();
      const nameL = String(name).trim().toLowerCase();
      const periodL = String(periodVal || "").trim().toLowerCase();
      const deptL = String(deptVal || "").trim().toLowerCase();
      if (!idL || !nameL) return true;
      if (SKIP_LABELS.has(idL) || SKIP_LABELS.has(nameL) || SKIP_LABELS.has(periodL)) return true;
      // Footer like: Staff count | 5 | Base | 60  → Name="Base", Dept="60"
      if (nameL === "base" || periodL === "staff count" || periodL === "handoff note") return true;
      // Staff ID must not be a bare number (those are summary counts)
      if (/^\d+(\.\d+)?$/.test(idL)) return true;
      // Department should not be only a number for a real person row
      if (deptL && /^\d+(\.\d+)?$/.test(deptL) && nameL === "base") return true;
      return false;
    }

    const staff = [];
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || !row.length) continue;
      const staffId = String(row[iId] || "").trim();
      const name = String(row[iName] || "").trim();
      const periodVal = iPeriod >= 0 ? row[iPeriod] : "";
      const deptVal = iDept >= 0 ? row[iDept] : "";
      if (isMetaRow(staffId, name, periodVal, deptVal)) continue;

      if (iPeriod >= 0 && row[iPeriod]) {
        const parsed = parsePeriod(String(row[iPeriod]));
        if (parsed) { year = parsed.year; month = parsed.month; }
      }

      const leave = emptyLeave();
      LEAVE_CODES.forEach((c) => {
        const idx = leaveIdx[c];
        if (idx >= 0) leave[c] = Number(row[idx]) || 0;
      });

      const projMap = {};
      projects.forEach((p) => { projMap[p.id] = 0; });
      projectCols.forEach((pc) => {
        const id = nameToId[pc.name];
        if (id) projMap[id] = Number(row[pc.idx]) || 0;
      });

      const person = {
        staffId,
        name,
        department: iDept >= 0 ? String(row[iDept] || "").trim() : "",
        leave,
        projects: projMap,
        denomFromFile: iDenom >= 0 ? Number(row[iDenom]) : null,
        baseFromFile: iBase >= 0 ? Number(row[iBase]) : null
      };
      staff.push(person);
    }

    if (!staff.length) throw new Error("No staff rows found in Staff Check file.");
    return { year, month, projects, staff, sheetName };
  }

  function parsePeriod(text) {
    const t = text.trim();
    // "August 2026"
    const m1 = t.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m1) {
      const mi = MONTH_NAMES.findIndex((n) => n.toLowerCase() === m1[1].toLowerCase());
      if (mi >= 0) return { year: Number(m1[2]), month: mi + 1 };
    }
    // "2026-08"
    const m2 = t.match(/^(\d{4})-(\d{1,2})$/);
    if (m2) return { year: Number(m2[1]), month: Number(m2[2]) };
    return null;
  }

  function fillPeriodSelects(yearSel, monthSel, year, month, onChange) {
    yearSel.innerHTML = "";
    for (let y = 2023; y <= 2030; y++) {
      yearSel.innerHTML += `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`;
    }
    monthSel.innerHTML = MONTH_NAMES.map((name, i) =>
      `<option value="${i + 1}" ${i + 1 === month ? "selected" : ""}>${name}</option>`
    ).join("");
    const fire = () => onChange(Number(yearSel.value), Number(monthSel.value));
    yearSel.addEventListener("change", fire);
    monthSel.addEventListener("change", fire);
  }

  /** Demo HR2 password — change for your workshop. Not production security. */
  const HR2_PASSWORD = "HR2-secure";
  const AUTH_KEY = "pcpHr2Auth";
  const HR1_STORE = "pcpHr1State";
  const HR2_STORE = "pcpHr2State";

  function isHr2Unlocked() {
    try { return sessionStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; }
  }

  function unlockHr2(password) {
    if (String(password) !== HR2_PASSWORD) return false;
    try { sessionStorage.setItem(AUTH_KEY, "1"); } catch (e) { /* ignore */ }
    return true;
  }

  function lockHr2() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
  }

  function saveJson(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  function loadJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clearJson(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  global.PCP = {
    LEAVE_CODES,
    MONTH_NAMES,
    STAFF_CHECK_SHEET,
    UNITS_PREFIX,
    HR2_PASSWORD,
    AUTH_KEY,
    HR1_STORE,
    HR2_STORE,
    isHr2Unlocked,
    unlockHr2,
    lockHr2,
    saveJson,
    loadJson,
    clearJson,
    daysInMonth,
    monthBase,
    monthAbbrev,
    periodLabel,
    fileStamp,
    analysisSheetName,
    emptyLeave,
    leaveSum,
    projectSum,
    staffStatus,
    escapeHtml,
    money,
    parseCsv,
    headerIndex,
    downloadExcel,
    downloadExcelMulti,
    readFileAsArrayBuffer,
    readFileAsText,
    buildStaffCheckRows,
    parseStaffCheckWorkbook,
    fillPeriodSelects
  };
})(window);
