# KiCanvas bundle provenance

- Upstream: https://github.com/theacodes/kicanvas
- Upstream commit: `b031159eb74aaa7eef2b026fd85d35bc05ff2095`
- Deep-link foundation: https://github.com/theacodes/kicanvas/pull/106
- Local patch: `deep-linking.patch`
- Bundle SHA-256: `f5e8b5b03ad6de63134e951bef3b4b5e4b00f911367560bdddc213135afc0225`
- Bundle size: `478361` bytes

The local patch also corrects KiCanvas's object-identity comparison for KiCad full-circle arcs, which otherwise produces `NaN` geometry for symbols whose arc start and end coordinates match. The checked-in bundle makes normal documentation builds deterministic and offline. Run `npm run refresh:kicanvas` from `docs/` to reproduce it, then update this file if the pinned upstream commit or bundle checksum changes.
