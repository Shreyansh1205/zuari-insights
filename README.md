# Zuari Insights

Upload a Zuari Excel report and get an interactive dashboard you can filter, explore and download as a report.
Everything runs in the browser; no file is uploaded to a server.

## Dashboards

| Dashboard | Upload | What you get |
|---|---|---|
| Business Dashboard | `Business_Report_2025-26.xlsx`, `Business_Report_2026-27.xlsx` (one or more) | Premium, revenue, endorsements, FY comparison, PDF/Excel |
| Customer Master | `Customer_Data.xlsx` | Customer list, contacts, state & city |
| **Claims Pending** | Monthly claims file(s), e.g. `Claims_Pending_till_30-09-26.xlsx` + `Non_GHI_Clain_Pending.xlsx` (31-08-26) | KPIs, ageing, pending-with, policy line, top insureds, trend across months, claims register, **remarks timeline per claim**, **what changed since last month**, month movement (new / updated / closed), PDF report + Excel with remarks history |
| Customer Meets | `Customer_Meet.xlsx` | Meetings, interactions, follow-ups |

### Claims Pending: how the remarks history works
- Each file (or each sheet inside a file) that has an **Insured Name** header is read as one monthly snapshot.
- The snapshot date comes from the last column header (**"Status as on 30-09-26"**), the title row (**"Claim Pending as on 30th Sept,2026"**) or the **Date of Report** column.
- The last column ("Status as on …") is treated as the running remark / conversation for the claim.
- Claims are matched month to month on **Insured Name + Date of Loss + Initial Amount Claimed + Nature of Incidence**, so keep those four values unchanged between months.
- Upload several months together (or use **+ Add month**) to see each claim's timeline, which remarks changed, new claims and claims that left the list.

## Tech
React 18 + Vite 5, Chart.js, three.js (3D hero / header scenes), SheetJS (xlsx), jsPDF + html2canvas.
Theme matches the main ZIBIL website: midnight navy, champagne gold, azure and teal; Fraunces + Manrope fonts.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Deploy / redeploy
Hosting settings (Vercel, Netlify or similar):
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- No environment variables are needed.

To redeploy, commit and push to the branch the host watches (usually `main`); the host rebuilds automatically.
