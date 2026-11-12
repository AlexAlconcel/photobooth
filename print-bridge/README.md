# RP30 USB/LAN print bridge

Vercel cannot talk to printer hardware. This bridge converts the photo strip to ESC/POS raster data for the RP30 80 mm printer and sends it through Windows USB printing or the printer's LAN raw port.

```bash
node print-bridge/server.mjs
```

USB mode is the default. Install the RP30 Windows driver and use the exact queue name:

```powershell
$env:RP30_CONNECTION="usb"
$env:RP30_PRINTER_NAME="RP30"
node print-bridge/server.mjs
```

For LAN mode, configure the printer's IP address. RP30 uses the standard ESC/POS raw port:

```powershell
$env:RP30_CONNECTION="lan"
$env:RP30_HOST="192.168.1.50"
$env:RP30_PORT="9100"
node print-bridge/server.mjs
```

It binds to `127.0.0.1:4173` and rejects non-local hosts. Open the app on the same computer, choose **Local print bridge**, choose **80 mm**, and print. Do not expose this process to the public internet.
