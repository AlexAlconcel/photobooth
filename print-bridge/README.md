# Optional local print bridge

Vercel cannot talk to a USB or Bluetooth printer. Run this tiny server only on the computer that is plugged into the printer.

```bash
node print-bridge/server.mjs
```

It binds to `127.0.0.1:4173` and rejects non-local hosts.

`GET /health` reports that the bridge is online. `POST /print` currently returns `501` until you add the adapter for your exact printer model (vendor SDK, ESC/POS, or another documented protocol). Do not expose this process to the public internet.
