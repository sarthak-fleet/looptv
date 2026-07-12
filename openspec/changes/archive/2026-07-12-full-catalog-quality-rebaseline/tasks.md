## 1. Quality rebaseline implementation

- [x] 1.1 Add tested full-history playlist pagination, metadata batching, eligibility filtering, ranking, and request budgeting.
- [x] 1.2 Add throttled per-source checkpoint persistence and resume behavior.
- [x] 1.3 Emit grouped per-source quality and quota metrics.

## 2. Selection integrity

- [x] 2.1 Mark full-history provenance in source rows and propagate it into catalog source metadata and audits.
- [x] 2.2 Change SNL to 30% while retaining the global 200-video source cap.
- [x] 2.3 Verify incremental refresh merges recent uploads with the verified top set without a second percentile pass.

## 3. Full catalog audit and shipment

- [x] 3.1 Run the resumable audit for all 122 sources within the global request ceiling.
- [x] 3.2 Rebuild the catalog and inspect every station/source for eligibility, counts, rank quality, and churn.
- [x] 3.3 Run tests, typecheck, formatting, catalog audits, and production build.
- [x] 3.4 Commit, push, deploy, verify production, archive the OpenSpec change, and verify final CI.
