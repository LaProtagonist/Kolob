/**
 * Current governed publication identity for the registered financial Google
 * Sheets.  It is deliberately separate from the business-model identities so
 * a publication refresh cannot be recorded as an historical model change.
 */
export const FINANCIAL_PUBLICATION_ITERATION_ID = "ITR-FINANCIAL-PUBLICATIONS-SYNC-2026-08-26-01";
// The current release decision approved the governed source state; this
// publication-only iteration introduces no financial assumptions or formulas.
export const FINANCIAL_PUBLICATION_DECISION_ID = "DEC-INVESTOR-TERMINAL-V2-RELEASE-2026-08-26-01";
export const FINANCIAL_PUBLICATION_CHANGE_SET_ID = "CHG-FINANCIAL-PUBLICATIONS-SYNC-2026-08-26-01";

export const FINANCIAL_MODEL_GOOGLE_RECEIPT_PATH = "docs-platform/changelog/google-sync/2026-08-26-DOC-FINANCIAL-MODEL.yaml";
export const INVESTOR_SUMMARY_GOOGLE_RECEIPT_PATH = "docs-platform/changelog/google-sync/2026-08-26-DOC-INVESTOR-FINANCIAL-SUMMARY.yaml";

// This separate identity records the corrective re-publication required when a
// historical merge range caused the first Investor Summary readback to fail.
export const INVESTOR_SUMMARY_PUBLISHER_FIX_ITERATION_ID = "ITR-INVESTOR-SUMMARY-PUBLISHER-MERGE-FIX-2026-08-26-01";
export const INVESTOR_SUMMARY_PUBLISHER_FIX_CHANGE_SET_ID = "CHG-INVESTOR-SUMMARY-PUBLISHER-MERGE-FIX-2026-08-26-01";
export const INVESTOR_SUMMARY_PUBLISHER_FIX_RECEIPT_PATH = "docs-platform/changelog/google-sync/2026-08-26-DOC-INVESTOR-FINANCIAL-SUMMARY-MERGE-FIX.yaml";
