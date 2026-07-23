# Foundation registry schema support

Date: 2026-07-23
Decision: DEC-003

## Technical changes

- Added the `principles` registry entity and JSON Schema for immutable canonical PRP text.
- Added the `dependencies` registry entity and JSON Schema for source-to-derived document mapping.
- Extended document metadata with optional `version` and `governance_level` fields.
- Extended registry validation to check principle document/source/decision references and dependency document references.

These are technical governance changes supporting Foundation v1.0. No existing approved text, website content, investment material, or financial model was edited.
