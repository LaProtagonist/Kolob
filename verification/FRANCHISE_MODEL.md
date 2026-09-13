# Franchise Model v0.1 verification

Use `npm run verify:affected` after edits; `npm run verify:release` at the requested content/seal boundary. Use Node 22.15.1 for the full release (see the reproducibility note below). Model-only checks also pass on bundled Node 24; system Node 18 cannot build Vite 7.

The independent `franchise-model` domain runs site TypeScript, pure model/storage tests, Control build, then deterministic browser scenarios. It has no financial-model sync or Network Planning dependencies.

- Arithmetic tests detect incorrect FTE, reserve/draw decomposition, settlement, actual franchise EBITDA, direct cost bases, double rent/fixed allocation, rollout and capacity errors. TypeScript cannot establish these business identities.
- Cash fixtures detect commitment treated as invested money, capital distributed as profit, missing reserve/future CAPEX protection, cap errors after additional draws, premature principal/cap return, incorrect IRR/MOIC and post-cap payouts. They use small independently calculated cash-flow series.
- Missing-input cases verify N/A propagation rather than a fictitious zero, while negative economic results remain visible.
- Immutability assertions compare Current Base/public Investor Terminal and canonical protected paths with audited commit `6e32ecb`. Tests never change Git or canonical data.
- Browser checks use temporary local backend data, isolated localStorage and controlled scenario inputs. They cover edits, persistence, scenario compare, invalid fields, capacity, synthetic completed cash flows, all 6 tabs at 1440/1024/768/390 and auth on Python and Node servers.
- The existing Control routing test includes the new route and scans the built public assets for protected model markers.

`node scripts/test-franchise-model.cjs --screenshots` saves six full-page 1440 px desktop images (one per tab, all tab details and warnings expanded) to `analysis/screenshots/franchise-model-ru-2026-09-13/`. This explicitly requested review supersedes the earlier one-image limit. Network/investor captures include one blank editor row to show expansion/capital-call controls; no missing costs are invented. The browser state is isolated and canonical defaults remain unchanged. Ordinary verification does not take screenshots.

The terminology assertion inspects visible text, tooltips, accessibility names and default scenario names across six tabs, compare/reference drawers, missing inputs and invalid editor states. It detects presentation regressions that TypeScript and arithmetic tests cannot detect. EBITDA, FCF, IRR, MOIC and FTE are allowed only with Russian labels. Long monthly tables are grouped vertically with the month repeated so every column is visible at desktop width.

Synthetic browser inputs for testing a complete cash-flow path: own local OPEX 200k/month, onboarding 300k/opening, point software 10k/month, additional production 20k/point/month, profit tax proxy 7%, minimum inflow tax proxy 1%, maintenance 100k/month. These are fixtures only, never working defaults or an approved future cost model.

A pre-existing TypeScript error in FranchisePlatform is corrected by checking property membership before accessing the optional Petrogradka note. It changes neither the note nor any scenario data.

For the full repository release on this machine use the installed **Node 22.15.1** runtime (`/Users/trbrmrdr/.nvm/versions/node/v22.15.1/bin`). It both supports Vite 7 and reproduces the pre-existing financial projection byte-for-byte. Node 24.19.0 computes one historical purchase/optimistic IRR as `0.4393689912688632` instead of stored `0.4393689912688634`; the strict legacy projection comparison therefore fails on that runtime. Read-only comparison confirmed every source file and stored projection unchanged from `6e32ecb`, and Node 22 reproduces all values exactly. No financial sync or tolerance relaxation was performed.

## v0.2 integration boundary

The domain additionally covers `control-format`, `FranchiseModelData`, the v0.2 profile and the new read-only source snapshot. `scripts/test-franchise-model-v02.test.ts` detects precision loss, empty/zero/N/A conflation, source/assumption drift, BOM price copying and BAR/GROW leakage, partial franchise CAPEX treated as complete, duplicated embedded expenses, wrong acquiring/tax/maintenance bases, wrong ramp/calendar application, and final investor outputs incorrectly enabled by missing costs. The existing v0.1 cash identities and public/current-base immutability checks remain in place. Source extraction checks are read-only in tests.

Formatting and parsing cases cannot be replaced by TypeScript; source parity cannot be established by a snapshot of the new engine. Browser assertions verify the actual field formatting, percentage/ruble toggle, visible two-base central breakdown, distinct list counts, collapsed monthly details, blocked final investor and separate preliminary estimate. The complete-cash fixture remains isolated in localStorage and is not a default.

For this iteration `node scripts/test-franchise-model.cjs --screenshots` writes six **full-page 1440 px** tab captures to `analysis/screenshots/franchise-model-v02-2026-09-13/`, plus `franchise-model-overview.png` covering dashboard and percentage flow. All active-tab parameter groups and equipment editors are expanded. Monthly detail tables remain collapsed as explicitly requested; read-only source metadata may remain in their details controls. Screenshots use unmodified working defaults, without adding blank financing or expansion events. No screenshots are tracked in Git.

The terminology audit excludes only explicit source metadata (file paths, assumption/item IDs), internationally recognizable abbreviations with Russian labels, and version identifiers. It checks visible labels/tooltips/empty states and large input grouping; the decimal audit disallows four or more fractional digits. Site scope and public build separation are verified through the existing release gate, not by writing additional public data.
