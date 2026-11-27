# Devpost Submission Kit — Arbiter Hacks V1 (Rethinking Waste Track)

Target hackathon: [Arbiter Hacks V1](https://arbiter-hacks-v1.devpost.com/)
Track: **Rethinking Waste** (Solo submission, $2,100 1st / $1,550 2nd USD cash)
Submission deadline: **December 20, 2026 (9:00 PM PST)**

---

## 1. Ready-to-Paste Devpost Fields

- **Project Name:** `SortWise`
- **Tagline:** `Municipal contamination firewall, composite splitter & waste impact studio`
- **Track Selection:** `Rethinking Waste`
- **Live Project URL:** `https://linhnguyen-gt.github.io/sortwise/`
- **GitHub Repository URL:** `https://github.com/linhnguyen-gt/sortwise`
- **Built With Tags:** `javascript`, `html5`, `css3`, `svg`, `web-speech-api`, `barcode-detector`, `epa-warm`, `accessibility`

### Mandatory Rethinking Waste Paragraph (Problem & Measurement)
**Waste Problem Targeted:** Curbside recycling programs regularly suffer 17–25% contamination rates driven by "wishcycling" (tossing greasy pizza boxes, plastic film bags, carbon-black takeout trays, and PLA bioplastics into blue bins) and catastrophic fires caused by lithium-ion batteries crushed at Materials Recovery Facilities (MRFs). Because rules vary sharply across cities and multi-material packaging requires splitting parts, residents guess wrong even when trying to recycle.

**How Impact Is Measured:** SortWise measures real waste reduction directly inside its **Bin Audit & Impact Ledger**: each audited item compares the *observed bin* against the *city-specific correct stream* and flags whether required composite splits were missed. Using published EPA WARM v16 material emission factors, SortWise computes live **Contamination Rate (%)**, **Clean Diversion Rate (%)**, **Diverted Mass (kg)**, **Avoided Emissions (kg CO2e)**, and **MRF Load-Rejection Risk** (`LOW` / `MEDIUM` / `HIGH`), then exports formula-safe CSV and JSON audit reports for before/after facility or campus comparisons.

### Full Project Description
- **What it does:** SortWise helps residents, cafes, and campus sustainability teams sort waste accurately by city (`San Francisco`, `New York City`, `Seattle`, `Austin`, `London`, `Ho Chi Minh City`, or any imported custom JSON rulepack). Users can type, speak hands-free via Web Speech API, scan a product barcode (`BarcodeDetector`), or inspect a photo to receive part-by-part sorting instructions, contamination warnings, and critical thermal-fire alerts for damaged lithium batteries.
- **How we built it:** Built with zero-dependency browser ES modules (`core/city-rules.js`, `core/item-catalog.js`, `core/triage-engine.js`, `core/impact-calculator.js`, `core/audit-ledger.js`), `vision-scanner.js`, `voice-controls.js`, and `app.js`. Every rulepack and item assembly is covered by 26 automated `node:test` unit and UI integration tests (`26/26` passing on Node `v24.18.0`), verified in headless Chrome with 0 console errors.
- **Challenges & Accomplishments:** Built a deterministic composite-splitting engine that separates clean cardboard lids from greasy bottoms, recognizes MRF tanglers and near-infrared-invisible carbon-black plastics, and protects CSV exports against spreadsheet formula injection (`OWASP CSV Injection`).
- **What's next:** Adding community-verified municipal rulepacks for 50+ cities and direct MRF contamination-audit photo checklists.

---

## 2. Ready-to-Upload Demo Video (`docs/sortwise-demo.mp4`)

A narrated HD MP4 walkthrough (`1280x720`, under 2 minutes) is generated at `docs/sortwise-demo.mp4` directly from the live deployed site. Upload `docs/sortwise-demo.mp4` directly to YouTube (unlisted or public) when submitting on Devpost.

---

## 3. Final Human Submission Checklist

1. Open [https://arbiter-hacks-v1.devpost.com/](https://arbiter-hacks-v1.devpost.com/), sign in, and register for the **Rethinking Waste** track.
2. Upload `docs/sortwise-demo.mp4` to YouTube.
3. Paste the fields from Section 1 (making sure to include the **Rethinking Waste Problem & Measurement** paragraph), attach the screenshots from `docs/screenshots/`, add the YouTube URL, and submit before **December 20, 2026**.
