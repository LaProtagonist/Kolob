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
