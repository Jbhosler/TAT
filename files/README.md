# Handoff: Auour Transition Report Template

## Overview
A redesigned visual template for the "Transition Report" PDF that your program currently generates for prospects being moved into an Auour strategy (e.g., *The Rhodes Living Trust — A. Crabbe / Auour Global Equity*). The original document was a plain, densely-tabled report; this template applies Auour's brand system (navy/brass palette, serif/sans type pairing) and adds a few visualizations (allocation bar, stacked comparison bars, donut option) on top of the same underlying data.

## About the Design Files
The bundled `Transition Report.dc.html` is a **design reference built in HTML** — it renders correctly in a browser and is genuinely pixel-accurate, but it is a prototype, not production code to import as-is. Your program most likely generates this report through its own PDF pipeline (a templating engine, a headless-browser-to-PDF step, a report library, etc.) in whatever stack it's written in. **The task is to recreate this layout and styling inside your program's existing report-generation environment**, driven by the same data your program already has, not to embed this HTML file directly (unless your program's PDF generator already works by rendering HTML/CSS — in which case this file's markup and inline styles can be adapted much more directly).

## Fidelity
**High-fidelity.** Colors, typography, spacing, and section structure below are final — implement pixel-accurately, not just "in the spirit of."

## Document Structure
The report is a paginated, Letter-size document (8.5in × 11in, 0.7in margins) with a running footer on every page. It has 8 sections in this order:

1. **Cover** — no page number, full first page
2. **01 — Portfolio Impact Summary**
3. **02 — Target Model Portfolio**
4. **03 — Current vs. Proposed by Asset Class** (+ Holdings Detail, same "03" — spans multiple pages)
5. **04 — Things to Note**
6. **05 — Trade Order Execution List**
7. **06 — Product Equivalent Mappings**
8. **Additional Disclosures** — unnumbered, always the last block on the last page

Each numbered section starts a new page (`break-before: page` in CSS terms) except sections that logically continue (Holdings Detail directly follows the asset-class comparison under the same "03").

## Design Tokens

**Colors**
- Navy (primary / ink): `#0C2340`
- Navy, muted body text: `#3A4A5F`
- Navy, faint borders: `rgba(12,35,64,0.08–0.18)`
- Brass (accent): `#A9773F`
- Gain / positive green: `#2F6B4F`
- Loss / negative red: `#B23A2E`
- Neutral gray (labels, captions): `#8A93A0` / `#6B7688`
- Subtotal row tint: `#EEF1F6`
- Callout background (amber notice): `#FBF5EA`, border `rgba(169,119,63,0.4)`, left border `#A9773F` (3px)
- Page background: white
- Chart palette (asset classes, in order): `#0C2340, #1E3F5F, #2F587A, #436F93, #5987AC, #7AA0C0, #9CB8D2, #BDD0E1, #A9773F, #C8A268` (+ `#B23A2E` for "Forced Sale" category if shown)

**Typography**
- Serif (headings, section numbers, pull-quotes, data emphasis): **Newsreader** — weights 400/500/600, italic used for pull-quotes and sub-labels
- Sans (body copy, tables, labels): **Libre Franklin** — weights 400/500/600/700
- Base body size: 13px / line-height 1.6
- Section heading: 24px Newsreader 500
- Section number badge: 15px Newsreader 600, brass color
- Cover title ("Transition Report"): 54px Newsreader 500, last word italicized
- Stat card big numbers: 29px Newsreader
- Table headers: 10px Libre Franklin 600, uppercase, letter-spacing 0.05–0.06em, gray
- Table body: 12.5–13px Libre Franklin
- Footer / disclosures: 9–9.5px
- All numeric columns use tabular figures (`font-variant-numeric: tabular-nums`)

**Spacing / layout**
- Page margin: 0.7in
- Section vertical rhythm: ~44px between major sections, 22px under section headers (with a 1px bottom border at `rgba(12,35,64,0.18)`)
- Stat cards: 3-column grid, 14px gap, 1px border, 16px padding
- Tables: 1.5px solid navy under header row, 1px `rgba(12,35,64,0.08–0.10)` between body rows

## Section-by-Section Detail

### Cover
- Header row: wordmark "Auour Investments" (19px Newsreader 500) + "Boston, Massachusetts · Est. 2013" (10px uppercase gray) on the left; "Confidential" (9px uppercase brass) top-right.
- Eyebrow: strategy name in brass uppercase serif, 13px, letter-spacing 0.16em.
- Title: "Transition Report" — 54px serif, "Report" italicized.
- 3-column meta grid below a divider: **Prospect**, **Strategy**, **Report Date** — label 9.5px uppercase gray, value 16px serif navy.

### 01 — Portfolio Impact Summary
- 3 stat cards side by side:
  1. **Net Realized Gain / Loss** — dollar figure, navy (not green — client asked this stay neutral/black).
  2. **Unrealized — Current** — dollar figure, navy.
  3. **Gain Retention Rate** (tinted card background `#F5F7FA`) — a **derived** percentage, bold, green: `100% − (Net Realized Gain / Loss ÷ Unrealized — Current)`. Caption spells out the formula with the actual dollar figures.
- Narrative copy (2–3 paragraphs) explaining current concentration risk and the rationale for the recommended strategy.
- A pull-quote: left brass border (2px), italic serif, 17px.

### 02 — Target Model Portfolio
- A single horizontal **stacked bar** (30px tall, 1px border) showing the target model's allocation, segments colored per the chart palette, 1px white dividers between segments.
- A wrapping legend below the bar: color chip + "Asset Class NN.NN%" per segment.
- A table: Model Ticker / Asset Class / Target % / Drift % (drift shown as `±3.00%` for every row in the current draft — confirm if real per-row drift data exists), with a bold "Total 100.00%" footer row.

### 03 — Current vs. Proposed by Asset Class
- A simple legend (navy chip = Current, brass chip = Proposed).
- For each asset class: a label column (170px) + two horizontal bar rows (current on top, proposed below), each 9px tall on a light-gray (`#F0F2F6`) track, with the percentage right-aligned next to each bar.
- **Bar scaling rule (important, iterated with the client):** bars are NOT scaled to a fixed 100% — they're scaled so that **the single largest value across all current/proposed percentages fills the full track width**, and every other bar is sized proportionally against that maximum. This avoids excess whitespace when no asset class approaches 100%. Compute the max once across all `cur` and `prop` values, then `width% = value / max * 100`.
- A caption below explains what happens to the "Forced Sale" bucket.
- *(A donut-chart alternative was explored and rejected in favor of bars — do not implement unless requested.)*

### 03 (cont.) — Holdings Detail
- Two tables, "Current portfolio (includes side pocket)" and "Proposed portfolio", each: Ticker / Asset Class / Value ($) / Unrealized ($) / % Total.
- Unrealized values are color-coded: green if positive, red if negative, gray `—` if zero.
- Subtotal rows per asset class are tinted (`#EEF1F6` background, bold navy text) and have no ticker.

### 04 — Things to Note
- Same body-copy treatment as the rest of the document (NOT footnote-style) — each item is a serif sub-heading (16px) followed by a regular paragraph (13px/1.6). Five items: Point-in-Time Estimate, Risk Priority Over Tax Efficiency, Prior Transactions Excluded, Share Class Illustrative Only, Legacy Mutual Fund Distributions. Exact copy is in the HTML file.

### 05 — Trade Order Execution List
- Two tables stacked: **Sells** (heading in red `#B23A2E`) and **Buys** (heading in green `#2F6B4F`), each with a thin divider rule next to the heading.
- Columns: Ticker / Amount ($) / Reasoning.

### 06 — Product Equivalent Mappings
- An amber callout box ("Action required...") when there are mappings not in the product-equivalents file — count is dynamic per report.
- Table: Legacy / Model / Grade / How Mapped.

### Additional Disclosures (unnumbered, always last)
- Visually distinct from "Things to Note": no sub-headings, single dense paragraph, small type (9.5px), gray, with a plain top border and a small uppercase "Additional Disclosures" label. Traditional compliance-boilerplate treatment, not a content section.

## Data This Template Needs Per Report
To regenerate this for any prospect/strategy, your program needs to supply:
- Prospect name, strategy name, report date
- Net realized gain/loss ($), unrealized current ($) — retention % is derived, don't store it separately
- Narrative paragraphs (or a templated version with variables for concentration %, sector names, strategy name)
- Target model rows: ticker, asset class, target %, drift %
- Current vs. proposed rows: asset class name, current %, proposed %
- Current holdings rows: ticker, asset class, value, unrealized, % of total (plus which rows are subtotals)
- Proposed holdings rows: same shape
- Sells: ticker, amount, reasoning
- Buys: ticker, amount, reasoning
- Product equivalent mappings: legacy ticker, model ticker, grade, how-mapped; plus whether any are unmapped (drives the amber callout)
- "Things to Note" and "Additional Disclosures" copy are largely static boilerplate — confirm whether they ever vary by report type.

## Assets
No external images/icons. Everything is CSS (colors, borders, inline "bar chart" divs). Fonts are loaded from Google Fonts: **Newsreader** and **Libre Franklin** (see `<link>` tags in the HTML `<head>` — if your PDF pipeline can't reach Google Fonts at render time, self-host these two families instead).

## Files in This Bundle
- `Transition Report.dc.html` — the full design reference, viewable directly in a browser. All colors/type/spacing above are copied from this file's inline styles — treat it as the source of truth if any detail in this README is ambiguous.
- `doc-page.js` — a small helper web component used only to get print pagination correct in the browser preview (paged Letter-size layout, repeating footer). Your program almost certainly has its own pagination mechanism (e.g. a PDF library's page-break handling) — use `doc-page.js` only as a reference for *what* needs to repeat per page (the footer text) and *where* page breaks fall, not as code to include.
