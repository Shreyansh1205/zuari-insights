import * as XLSX from 'xlsx';

function findCol(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) return name;
  }
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    const found = keys.find(k => k && k.toString().trim().toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  for (const name of possibleNames) {
    const found = keys.find(k => k && k.toString().toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }
  return null;
}

function parseNumber(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getDateParts(val) {
  if (!val) return { monthKey: 'Unknown', monthSort: '9999-99', year: 'Unknown', fy: 'Unknown' };
  let d;
  if (val instanceof Date) d = val;
  else if (typeof val === 'number') d = new Date(Math.round((val - 25569) * 86400 * 1000));
  else d = new Date(val);
  if (isNaN(d.getTime())) return { monthKey: 'Unknown', monthSort: '9999-99', year: 'Unknown', fy: 'Unknown' };
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  // Indian FY: April (3) to March → FY starts in April
  // If month >= April (3) → FY = year-(year+1), else FY = (year-1)-year
  let fy;
  if (month >= 3) {
    fy = `${year}-${String(year + 1).slice(2)}`;
  } else {
    fy = `${year - 1}-${String(year).slice(2)}`;
  }
  const monthKey = d.toLocaleString('en-US', { month: 'short' }) + ' ' + year;
  const monthSort = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { monthKey, monthSort, year: String(year), fy };
}

/** Classify endorsement from InstNo */
export function getEndorsementType(instNo) {
  if (instNo == null || instNo === '' || instNo === 0 || instNo === '0') return 'Fresh';
  const s = String(instNo).trim().toUpperCase();
  if (/^E\d+/i.test(s)) return s;           // E1, E2, E3...
  if (/^E$/i.test(s)) return 'E';
  return 'Fresh';
}

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

        if (rows.length > 0) {
          const firstKeys = Object.keys(rows[0]);
          const hasDepartment = firstKeys.some(k => /department/i.test(k));
          const hasPBST = firstKeys.some(k => /pbst/i.test(k));
          if (!hasDepartment && !hasPBST) {
            rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: 1 });
          }
        }

        if (!rows.length) return reject(new Error('No data rows found'));

        const sample = rows[0];
        // Detect FY column (e.g. FY(25-26), FY(26-27), FY)
        const allKeys = Object.keys(sample);
        const fyColName = allKeys.find(k => k && /^FY\s*\(/i.test(k.trim())) 
                       || allKeys.find(k => k && /^FY/i.test(k.trim()))
                       || null;

        const colMap = {
          instNo: findCol(sample, ['InstNo', 'Inst No', 'Inst.No']),
          busDate: findCol(sample, ['Bus/PropDate', 'Bus/Prop Date', 'StartDate', 'Start Date']),
          expiryDate: findCol(sample, ['ExpiryDate', 'Expiry Date']),
          custName: findCol(sample, ['CustName', 'Cust Name', 'Customer Name', 'InsuredName']),
          groupNonGroup: findCol(sample, ['Group / Non Group', 'Group/Non Group']),
          department: findCol(sample, ['Department']),
          policyType: findCol(sample, ['Policy Type', 'PolicyType']),
          insurer: findCol(sample, ['Insurer']),
          premium: findCol(sample, ['PBST(NP)', 'PBST', 'GrossPremium']),
          revenue: findCol(sample, ['Total(Brok+Rew+TP)', 'TotalBrok.', 'Brokerage', 'TotalComBrokpremium']),
          policyVertical: findCol(sample, ['PolicyVertical', 'Policy Vertical']),
          unbilled: findCol(sample, ['UnBilled Brok Amount', 'UnBilled Brok. Amount', 'Unbilled', 'TotalBrok. Due']),
          fyCol: fyColName
        };

        const normalized = rows.map((row, idx) => {
          const busDateVal = colMap.busDate ? row[colMap.busDate] : null;
          const parts = getDateParts(busDateVal);
          const instNo = colMap.instNo ? row[colMap.instNo] : null;
          const premium = colMap.premium ? parseNumber(row[colMap.premium]) : 0;
          const revenue = colMap.revenue ? parseNumber(row[colMap.revenue]) : 0;

          // Prefer explicit FY column value (e.g. 2026 from FY(25-26), 2027 from FY(26-27))
          let fyValue = parts.fy;
          if (colMap.fyCol && row[colMap.fyCol] != null && row[colMap.fyCol] !== '') {
            const raw = String(row[colMap.fyCol]).trim();
            // If value is like 2026 or 2027, convert to FY label
            if (/^\d{4}$/.test(raw)) {
              const y = parseInt(raw, 10);
              // Convention: value 2026 means FY 2025-26, value 2027 means FY 2026-27
              fyValue = `${y - 1}-${String(y).slice(2)}`;
            } else {
              fyValue = raw;
            }
          }

          return {
            id: `${file.name}-${idx}`,
            sourceFile: file.name,
            instNo,
            endorsementType: getEndorsementType(instNo),
            isEndorsement: getEndorsementType(instNo) !== 'Fresh',
            busDate: busDateVal,
            expiryDate: colMap.expiryDate ? row[colMap.expiryDate] : null,
            custName: colMap.custName ? String(row[colMap.custName] || 'Unknown') : 'Unknown',
            groupNonGroup: colMap.groupNonGroup ? String(row[colMap.groupNonGroup] || 'Unknown') : 'Unknown',
            department: colMap.department ? String(row[colMap.department] || 'Unknown') : 'Unknown',
            policyType: colMap.policyType ? String(row[colMap.policyType] || 'Unknown') : 'Unknown',
            insurer: colMap.insurer ? String(row[colMap.insurer] || 'Unknown') : 'Unknown',
            premium,
            revenue,
            brokeragePct: premium ? (revenue / premium) * 100 : 0,
            unbilled: colMap.unbilled ? parseNumber(row[colMap.unbilled]) : 0,
            policyVertical: colMap.policyVertical ? String(row[colMap.policyVertical] || 'Unknown') : 'Unknown',
            monthKey: parts.monthKey,
            monthSort: parts.monthSort,
            year: parts.year,
            fy: fyValue
          };
        });

        resolve({
          fileName: file.name,
          rows: normalized,
          years: [...new Set(normalized.map(r => r.fy).filter(y => y !== 'Unknown'))].sort()
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function formatCurrency(n) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return '₹ ' + (n / 1e7).toFixed(2) + ' Cr';
  if (abs >= 1e5) return '₹ ' + (n / 1e5).toFixed(2) + ' L';
  return '₹ ' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatNumber(n) {
  return Number(n).toLocaleString('en-IN');
}

export function formatPct(n) {
  return (n || 0).toFixed(1) + '%';
}