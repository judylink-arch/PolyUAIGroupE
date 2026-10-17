/* Shared helpers for Project Cost Payroll — no salary logic here */
(function (global) {
  const LEAVE_CODES = ["AL", "SL", "NPL", "PH", "OFF", "Admin", "CL"];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const STAFF_CHECK_SHEET = "Staff Check Summary";
  const STAFF_TS_SHEET = "Staff Timesheet";
  const STAFF_DAILY_SHEET = "Daily Entries";
  const UNITS_PREFIX = "Units: ";

  /** Quad-Tech style codes: half-day (AM or PM) = 1 unit. Base = days × 2. */
  const DEFAULT_PROJECT_CODES = [
    { code: "2107EM20M", label: "Eastern Harbour Tunnel" },
    { code: "2656EM20M", label: "Hotung Secondary School" },
    { code: "3083EM20M", label: "Hong Kong Children's Hospital" },
    { code: "2435EM21M", label: "學校 Project" },
    { code: "1497EM22M", label: "Shatin Hospital" },
    { code: "1611EM22M", label: "North Lantau Hospital" },
    { code: "1865EM22M", label: "學校 Project" },
    { code: "1735EM22W", label: "New Territories West" },
    { code: "元朗宏業西街", label: "元朗宏業西街" },
    { code: "Kai Tak 1B2", label: "Kai Tak 1B2" },
    { code: "Tsat Sing Kong", label: "Tsat Sing Kong" },
    { code: "焚化爐（MVAC & ELV）", label: "焚化爐（MVAC & ELV）" },
    { code: "Kai Tak 1B3", label: "Kai Tak 1B3" },
    { code: "GDS KC1", label: "GDS KC1" },
    { code: "GDS KC2", label: "GDS KC2" },
    { code: "EMSD Tender", label: "EMSD Tender" },
    { code: "General Tendering", label: "General Tendering" }
  ];

  function projectDisplayName(code, label) {
    const c = String(code || "").trim();
    const l = String(label || "").trim();
    if (!c) return l;
    if (!l || l.toLowerCase() === c.toLowerCase()) return c;
    return c + " — " + l;
  }

  function defaultProjects() {
    return DEFAULT_PROJECT_CODES.map((p, i) => ({
      id: "QP" + (i + 1),
      name: projectDisplayName(p.code, p.label),
      code: p.code
    }));
  }

  function isLeaveCode(code) {
    const c = String(code || "").trim();
    return LEAVE_CODES.some((x) => x.toLowerCase() === c.toLowerCase());
  }

  function normalizeSlotCode(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    const leaveHit = LEAVE_CODES.find((c) => c.toLowerCase() === s.toLowerCase());
    if (leaveHit) return leaveHit;
    return s;
  }

  /**
   * Aggregate AM/PM day slots into leave + project unit maps.
   * days: [{ date, am, pm }] — each non-empty slot = 1 unit.
   */
  function aggregateDaySlots(days, projectList) {
    const leave = emptyLeave();
    const byCode = {};
    const codeToProject = {};
    (projectList || []).forEach((p) => {
      const code = String(p.code || p.name || "").trim();
      if (code) codeToProject[code.toLowerCase()] = p;
      // also match display name prefix before " — "
      const name = String(p.name || "").trim();
      if (name) codeToProject[name.toLowerCase()] = p;
      const dash = name.indexOf(" — ");
      if (dash > 0) codeToProject[name.slice(0, dash).toLowerCase()] = p;
    });

    (days || []).forEach((d) => {
      [d.am, d.pm].forEach((raw) => {
        const code = normalizeSlotCode(raw);
        if (!code) return;
        if (isLeaveCode(code)) {
          leave[code] = (leave[code] || 0) + 1;
          return;
        }
        byCode[code] = (byCode[code] || 0) + 1;
      });
    });

    const projectsOut = [];
    const projMap = {};
    Object.keys(byCode).forEach((code, i) => {
      const known = codeToProject[code.toLowerCase()];
      const id = known ? known.id : ("AUTO" + (i + 1));
      const name = known ? known.name : code;
      if (!projectsOut.find((p) => p.id === id)) {
        projectsOut.push({ id, name, code: known ? (known.code || code) : code });
      }
      projMap[id] = (projMap[id] || 0) + byCode[code];
    });

    return { leave, projects: projectsOut, projectUnits: projMap, codeUnits: byCode };
  }

  function monthAbbrevFromAny(text) {
    const t = String(text || "").trim().toLowerCase();
    if (!t) return 0;
    const short = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const si = short.indexOf(t.slice(0, 3));
    if (si >= 0) return si + 1;
    const mi = MONTH_NAMES.findIndex((n) => n.toLowerCase() === t);
    return mi >= 0 ? mi + 1 : 0;
  }

  /** Build downloadable staff submission: summary + daily AM/PM rows */
  function buildStaffSubmissionSheets(person, projects, year, month, days) {
    const st = staffStatus(person, projects, year, month);
    const summary = [
      [
        "Period", "Staff ID", "Employee Name", "Department",
        ...LEAVE_CODES,
        "Leave total", "Base", "Denom", "Project units", "Status",
        ...projects.map((p) => UNITS_PREFIX + p.name)
      ],
      [
        periodLabel(year, month),
        person.staffId,
        person.name,
        person.department || "",
        ...LEAVE_CODES.map((c) => Number(person.leave[c]) || 0),
        st.leave,
        st.base,
        st.denom,
        st.pUnits,
        st.ok ? "OK" : "ERROR: denom <> project units",
        ...projects.map((p) => Number(person.projects[p.id]) || 0)
      ]
    ];
    const daily = [["Date", "Day", "AM", "PM"]];
    (days || []).forEach((d) => {
      daily.push([
        d.date || "",
        d.day || "",
        normalizeSlotCode(d.am) || "",
        normalizeSlotCode(d.pm) || ""
      ]);
    });
    return [
      { name: STAFF_TS_SHEET, rows: summary },
      { name: STAFF_DAILY_SHEET, rows: daily }
    ];
  }

  function cellStr(aoa, r, c) {
    if (!aoa[r]) return "";
    const v = aoa[r][c];
    return v == null ? "" : String(v).trim();
  }

  function excelSerialToDate(n) {
    // Excel serial (Windows) → JS Date
    const ms = Math.round((Number(n) - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatYmd(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function weekdayShort(d) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }

  /**
   * Parse staff HTML export (.xlsx with Staff Timesheet sheet)
   * or a one-row Staff Check style summary.
   */
  function parseStaffSubmissionWorkbook(arrayBuffer, hintProjects) {
    ensureXlsx();
    const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const names = wb.SheetNames || [];

    // Prefer dedicated staff submission sheet; else Staff Check; else first
    let sheetName = names.includes(STAFF_TS_SHEET)
      ? STAFF_TS_SHEET
      : (names.includes(STAFF_CHECK_SHEET) ? STAFF_CHECK_SHEET : names[0]);
    if (!sheetName) throw new Error("Workbook has no sheets.");

    // Quad-Tech native template? (detect first; do not confuse with Staff Timesheet export)
    try {
      const qt = tryParseQuadTechWorkbook(wb, hintProjects);
      if (qt) return qt;
    } catch (e) {
      const first = wb.Sheets[wb.SheetNames[0]];
      const aoa0 = first ? XLSX.utils.sheet_to_json(first, { header: 1, defval: "" }) : [];
      const title0 = String(aoa0[0]?.[0] || "");
      if (/timesheet|工作時間/i.test(title0)) throw e;
      // else fall through to Staff Timesheet / Staff Check parser
    }

    const parsed = parseStaffCheckWorkbook(arrayBuffer);
    // Attach daily if present
    if (names.includes(STAFF_DAILY_SHEET)) {
      const dailyAoa = XLSX.utils.sheet_to_json(wb.Sheets[STAFF_DAILY_SHEET], { header: 1, defval: "" });
      const days = [];
      for (let r = 1; r < dailyAoa.length; r++) {
        const row = dailyAoa[r];
        if (!row || !row.length) continue;
        const am = normalizeSlotCode(row[2]);
        const pm = normalizeSlotCode(row[3]);
        if (!am && !pm && !row[0]) continue;
        days.push({ date: String(row[0] || ""), day: String(row[1] || ""), am, pm });
      }
      parsed.days = days;
    }
    parsed.source = "staff-submission";
    return parsed;
  }

  /**
   * Parse Quad-Tech Timesheet Excel (AM=col E, PM=col J, half-day = 1 unit).
   * Returns null if not that format.
   */
  function tryParseQuadTechWorkbook(wb, hintProjects) {
    const sheet = wb.Sheets[(wb.SheetNames || []).find((n) => /time\s*sheet/i.test(n)) || wb.SheetNames[0]];
    if (!sheet) return null;
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    if (!aoa.length) return null;
    const title = cellStr(aoa, 0, 0);
    if (!/timesheet|工作時間/i.test(title) && !cellStr(aoa, 2, 0).match(/NAME|姓名/i)) {
      return null;
    }
    // Confirm AM/PM header row
    let headerR = -1;
    for (let r = 0; r < Math.min(12, aoa.length); r++) {
      const e = cellStr(aoa, r, 4);
      const j = cellStr(aoa, r, 9);
      if (/09|AM|TIME/i.test(e) || e === "09 - 10") { headerR = r; break; }
      if (/13:30|PM/i.test(j)) { headerR = r; break; }
    }
    if (headerR < 0) {
      // still accept if NAME + MONTH present
      if (!/NAME|姓名/i.test(cellStr(aoa, 2, 0))) return null;
      headerR = 7; // Quad-Tech template default
    }

    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    // Year often in row2 col16 like "/2023"
    for (let c = 0; c < 20; c++) {
      const yHit = String(aoa[1]?.[c] ?? "").match(/\/?(20\d{2})/);
      if (yHit) { year = Number(yHit[1]); break; }
    }
    // Month in N3 (col 14 index 13)
    for (let c = 12; c < 18; c++) {
      const m = monthAbbrevFromAny(aoa[2]?.[c]);
      if (m) { month = m; break; }
    }

    // Name / dept — cells to the right of labels (often empty in blank template)
    let name = "";
    let department = "";
    let staffId = "";
    for (let c = 1; c < 12; c++) {
      const v = cellStr(aoa, 2, c);
      if (v && !/NAME|姓名|MONTH|月份/i.test(v)) { name = v; break; }
    }
    for (let c = 13; c < 20; c++) {
      const v = cellStr(aoa, 4, c);
      if (v && !/DEPT|部門/i.test(v)) { department = v; break; }
    }
    // Optional Staff ID near position row
    for (let c = 1; c < 12; c++) {
      const v = cellStr(aoa, 4, c);
      if (v && !/POSITION|職位/i.test(v)) {
        if (/^H\s?\d+/i.test(v) || /staff/i.test(v)) staffId = v;
        break;
      }
    }

    const days = [];
    const startR = headerR + 1;
    for (let r = startR; r < Math.min(startR + 35, aoa.length); r++) {
      const rawDate = aoa[r]?.[0];
      let dateObj = null;
      if (rawDate instanceof Date) dateObj = rawDate;
      else if (typeof rawDate === "number") dateObj = excelSerialToDate(rawDate);
      else if (rawDate) {
        const tryD = new Date(rawDate);
        if (!Number.isNaN(tryD.getTime())) dateObj = tryD;
      }
      // Stop at summary labels
      const a0 = cellStr(aoa, r, 0);
      if (/PRO\/JOB|ADMIN|Total|總/i.test(a0)) break;
      if (!dateObj && !cellStr(aoa, r, 4) && !cellStr(aoa, r, 9)) continue;
      if (!dateObj) continue;

      const am = normalizeSlotCode(aoa[r][4]);
      const pm = normalizeSlotCode(aoa[r][9]);
      days.push({
        date: formatYmd(dateObj),
        day: cellStr(aoa, r, 3) || weekdayShort(dateObj),
        am,
        pm
      });
    }

    if (!days.length) {
      throw new Error("Quad-Tech timesheet found but no day rows with dates. Fill the month grid first.");
    }

    const baseProjects = (hintProjects && hintProjects.length) ? hintProjects : defaultProjects();
    const agg = aggregateDaySlots(days, baseProjects);

    // Union projects: known list + any new codes from file
    const projects = [];
    const seen = new Set();
    baseProjects.forEach((p) => {
      if (!seen.has(p.id)) { projects.push(p); seen.add(p.id); }
    });
    agg.projects.forEach((p) => {
      if (!seen.has(p.id)) { projects.push(p); seen.add(p.id); }
    });

    const personProjects = {};
    projects.forEach((p) => { personProjects[p.id] = Number(agg.projectUnits[p.id]) || 0; });

    if (!name) name = "(Imported Quad-Tech — set name)";
    if (!staffId) staffId = "QT-" + formatYmd(new Date()).replace(/-/g, "");

    return {
      year,
      month,
      projects,
      staff: [{
        staffId,
        name,
        department,
        leave: agg.leave,
        projects: personProjects
      }],
      days,
      source: "quad-tech"
    };
  }

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
    STAFF_TS_SHEET,
    STAFF_DAILY_SHEET,
    UNITS_PREFIX,
    DEFAULT_PROJECT_CODES,
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
    parseStaffSubmissionWorkbook,
    buildStaffSubmissionSheets,
    aggregateDaySlots,
    defaultProjects,
    projectDisplayName,
    isLeaveCode,
    normalizeSlotCode,
    fillPeriodSelects
  };
})(window);
