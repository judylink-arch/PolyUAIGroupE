# Project Cost Payroll (HR1 / HR2 access rights)

## Access model

| Role | Page | Password | Can do | Cannot do |
|------|------|----------|--------|-----------|
| **Staff** | `staff.html` | None | Daily AM/PM timesheet (½ day = 1 unit), download Staff Timesheet .xlsx | Salary, HR2 actions |
| **HR1** | `hr1.html` | None | Import staff / Quad-Tech timesheets, adjust, denom check, export Staff Check Summary | Salary, calculate |
| **HR2** | `hr2.html` | Yes (`HR2-secure` demo) | Import Staff Check + salary Y, calculate, export Salary (Actual) & Project Analysis | Edit timesheet units |

### Staff → HR1 auto import
1. Staff opens `staff.html`, fills AM/PM codes, downloads Excel.
2. HR1 opens `hr1.html` → **Upload staff timesheet(s) .xlsx** (multi-file OK).
3. Also accepts original **Quad-Tech Timesheet** Excel (AM col E, PM col J).

### Dummy test pack (10 staff, August 2026)
| File | Use |
|------|-----|
| `dummy-timesheets/*.xlsx` | 10 completed staff timesheets (all denom OK) |
| `Staff_Timesheets_2026-08_dummy10.zip` | Same 10 files zipped |
| `Staff_Check_Summary_2026-08_dummy10.xlsx` | Combined summary (HR1 already aggregated) |
| `dummy_salary_list_10.csv` | Matching salary Y for HR2 |

- Start at **`index.html`** to choose role.
- Opening `hr2.html` without unlock redirects back to the password box.
- Unlock is stored in `sessionStorage` for this browser tab session; use **Lock HR2** to log out.
- Timesheet / salary work-in-progress is saved in `localStorage` so Back to role select does not wipe data.
- Change `HR2_PASSWORD` in `shared.js` for your workshop (not production security).

## Recommended handoff
1. HR1 opens `hr1.html` → prepare timesheet → **Download Staff Check Summary (.xlsx)**
2. Send only that `.xlsx` to HR2 (not the HR1 browser page)
3. HR2 unlocks via `index.html` → upload Staff Check → import salary CSV → Calculate → export reports

## Files
| File | Who |
|---|---|
| `index.html` | Role select + HR2 password gate |
| `hr1.html` | HR1 workstation |
| `hr2.html` | HR2 workstation (locked) |
| `shared.js` / `shared.css` | Shared helpers + gold theme |
| `xlsx.full.min.js` | Excel read/write |
| `dummy_staff_list.csv` | HR1 test |
| `dummy_salary_list.csv` | HR2 test only |

## Open
Open `index.html` in a browser (or double-click the file).
