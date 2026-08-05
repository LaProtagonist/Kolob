# Governance History v2

Governance History v2 is the portable machine link between a proposal, approval, change set, application, verification, content commit, external synchronization or deployment, generated Codex context, and a recoverable rollback or compensating change. It changes governance infrastructure only; it does not approve business content.

## Canonical chain

`events.ndjson` is append-only. Its hash chain follows recording order (`recorded_at`), while `occurred_at` preserves the historical time of imported evidence. Existing lines and receipts are immutable; omissions and corrections are represented by later events. `TIMELINE.md`, `PROJECT_STATE.yaml`, and `CODEX_HANDOFF.md` are generated projections.

The normal lifecycle is:

`proposed → approved → applied → verified → content commit → committed event + annotated tag → seal commit`

The content commit carries these trailers:

```text
Iteration-ID:
Decision-ID:
Change-Set-ID:
Approved-Payload-SHA256:
Before-State-SHA256:
After-State-SHA256:
Timeline-Head-SHA256:
```

Use `npm run iteration:finalize -- --iteration <id> --message "<message>"`. The workflow stages only the declared iteration scope and never pushes.

## Recovery semantics

`iteration:rollback:preview` and `iteration:rollback:prepare` accept only a suffix length (`--steps`). They reverse the latest sealed iterations in reverse order through a new proposed plan and never use `git reset`.

`iteration:compensate:preview -- --iteration <id>` analyzes a historical iteration against current files, identifies surviving effects and later overlapping iterations, and returns a new proposed compensating change. It does not apply anything and requires a separate approved decision. A completed compensation records `compensated` with `compensates_iteration_id`; it never changes the historical iteration.

## External state and drift

New Google receipts include both local and remote readback hashes plus the content commit. New deployment receipts include the content commit and build hash. Drift checks are read-only: on a confirmed mismatch they append `external_drift_detected`, show the hash diff, and require import or restore preview. They never overwrite remote or local content automatically.

Legacy receipts without a machine readback hash remain immutable and are reported as such. An unavailable authenticated readback is not reported as a successful drift check.

## Review artifacts

Large PDFs and images remain outside ordinary Git. Every artifact used to support `verified` has a committed manifest with its SHA-256, size, purpose and storage status. Preferred durable storage is:

`Колобочная — Investment / Audit Artifacts / <iteration_id>`

Until a durable URL is recorded, verification evidence is `pending_archive` and the visual audit is not fully portable. Files are not deleted automatically, and Git LFS is not introduced without a separate decision.

## Snapshots

Snapshots are metadata manifests, not full document copies. They are required after every tenth closed change and at the named Foundation, Business Model Architecture, major CAPEX, pre-investment-memo, and pre-full-financial-model milestones. Each manifest anchors the timeline event, tag, content commit, registry, canonical document hashes, Google readbacks, deployment URL and open questions.

