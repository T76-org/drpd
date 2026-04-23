# Frontend

Primary docs:

- [Designer getting started](./docs/designer-getting-started.md)
- [Rack and instruments](./docs/rack-instruments.md)
- [Dr. PD device model](./docs/drpd-device.md)
- [Dr. PD worker runtime](./docs/drpd-worker-runtime.md)
- [Dr. PD firmware updater](./docs/drpd-firmware-updater.md)

Run locally:

```bash
npm run dev
```

For LAN debugging from another machine, start the HTTPS dev server:

```bash
npm run dev:https
```

The server stays on port `5173`. If you want to use the generated development
certificate, set `DRPD_DEV_PUBLIC_HOST` to a hostname that resolves to the dev
machine and use the exact HTTPS URL Vite prints, for example
`https://drpd.local:5173/`. If you want to use a raw LAN IP or a different
certificate name, point `DRPD_DEV_HTTPS_CERT` and `DRPD_DEV_HTTPS_KEY` at a
certificate whose SANs include that address or hostname.
