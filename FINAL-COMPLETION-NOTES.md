# Final Completion Notes

This package includes the final completion patch requested after mentor review.

## New assigned function

**Export Decision Evidence**

- Dashboard button: `Export Decision Evidence`
- API: `GET /api/evidence/export`
- Downloads a PHI-Zero JSON file containing canonical scenario state, domain scores, root causes, cascade paths, Guard blocks, Plan A/B/C, approval/audit evidence, real-GPU boundary, notifications, and no-execution safety metadata.

## Final runtime fixes

- Stroke Crisis remains visible after Hospital Twin Sync.
- Hospital Cascade reports its own canonical scenario ID.
- GPU-2/GPU-3 crisis telemetry is derived from canonical entities.
- Guard–Ruler evaluation refreshes all dependent panels automatically.
- Demo operator login survives browser refreshes in the same tab session.
- Current and projected saving labels are no longer ambiguous.
- Network/dependency Guard blocks use human-readable explanations.
- Lint cleanup and `next/image` GIF rendering are included.

## Verify after extraction

```bash
npm ci
cp .env.example .env.local
npm run check
npm run dev
```
