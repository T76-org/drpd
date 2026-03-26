# Frontend

Primary docs:

- [Designer getting started](./docs/designer-getting-started.md)
- [Rack and instruments](./docs/rack-instruments.md)
- [Dr. PD device model](./docs/drpd-device.md)
- [Dr. PD worker runtime](./docs/drpd-worker-runtime.md)

Run locally:

```bash
npm run dev
```

Run locally over HTTPS for WebUSB/OPFS testing on `192.168.199.1`:

1. Install [`mkcert`](https://github.com/FiloSottile/mkcert) and initialize the local CA once:

```bash
mkcert -install
```

2. Generate a certificate that covers both `localhost` and `192.168.199.1`:

```bash
mkdir -p .cert
mkcert -key-file .cert/dev-key.pem -cert-file .cert/dev-cert.pem localhost 127.0.0.1 ::1 192.168.199.1
```

3. Start Vite with the certificate paths:

```bash
VITE_DEV_HTTPS_KEY=.cert/dev-key.pem \
VITE_DEV_HTTPS_CERT=.cert/dev-cert.pem \
npm run dev
```

With that setup, the dev server can be reached at `https://localhost:5173/` and `https://192.168.199.1:5173/`, and Chrome will honor COOP/COEP headers on the trusted HTTPS origin.
