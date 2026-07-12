## 1. Provenance and Refresh Semantics

- [x] 1.1 Add regression tests for fallback, partial, empty, missing, and complete source states.
- [x] 1.2 Extend catalog/source types with backward-compatible provenance and coverage metadata.
- [x] 1.3 Update catalog processing to preserve metadata, compute coverage, and separate `generatedAt` from truthful `lastUpdated`.
- [x] 1.4 Replace misleading fallback percentile logs with explicit preservation output.

## 2. Catalog Health and Audit

- [x] 2.1 Treat missing and unknown source metadata as a visible health state in the client.
- [x] 2.2 Add grouped catalog health audit output and consistency/coverage gates.
- [x] 2.3 Wire the audit report and override behavior into the catalog workflow summary.
- [x] 2.4 Audit the checked-in catalog and archived July 10 source artifacts; record findings.

## 3. Playback Diversity

- [x] 3.1 Add a regression test proving normal playback can select outside the top 12.
- [x] 3.2 Make normal selection uniform across the filtered curated pool without changing Smart Mix.

## 4. Verification and Documentation

- [x] 4.1 Run focused tests, full tests, typecheck, Biome, catalog audits, and production build.
- [x] 4.2 Update catalog auditability documentation and `PROJECT_STATUS.md`.
- [x] 4.3 Validate and archive the OpenSpec change after all requirements pass.
