# KiCanvas bundle provenance

- Upstream: https://github.com/theacodes/kicanvas
- Upstream commit: `b031159eb74aaa7eef2b026fd85d35bc05ff2095`
- Deep-link foundation: https://github.com/theacodes/kicanvas/pull/106
- Local patch: `deep-linking.patch`
- Bundle SHA-256: `62ba450c3e65bffecaf34a52d676e29e5cf8a7243285dc7f43a286e62cf295e1`
- Bundle size: `478915` bytes

The local patch also corrects KiCanvas's object-identity comparison for KiCad full-circle arcs, which otherwise produces `NaN` geometry for symbols whose arc start and end coordinates match. Deep links wait for the initial sheet and requested sheet to finish loading before selecting, avoiding nondeterministic cross-sheet selection. The checked-in bundle makes normal documentation builds deterministic and offline. Run `npm run refresh:kicanvas` from `docs/` to reproduce it, then update this file if the pinned upstream commit or bundle checksum changes.
