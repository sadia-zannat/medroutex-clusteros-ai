# Final Submission Checklist

- [ ] Run `npm ci`
- [ ] Copy `.env.example` to `.env.local`
- [ ] Run `npm run check`
- [ ] Confirm baseline 88/91 and 52 entities / 21 relationships
- [ ] Confirm RTX panel connects locally
- [ ] Confirm Stroke Crisis keeps 2 risky GPUs after Hospital Sync
- [ ] Confirm Evaluate Safe Plans refreshes Digital Twin, Route Planner, and Approval Queue automatically
- [ ] Confirm operator login survives a browser refresh during the same tab session
- [ ] Confirm approval is audit-only and no physical execution is claimed
- [ ] Confirm Unified History contains approval, Guard blocks, and scenario evidence
- [ ] Confirm `Export Decision Evidence` downloads a JSON file
- [ ] Confirm Hospital Cascade Raw API scenario is `hospital-cascade-crisis`
- [ ] Record a 2–3 minute backup demo video
- [ ] Submit source ZIP without `node_modules`, `.next`, `.env.local`, `.data`, or `.core-test`
