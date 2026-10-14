This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## QR sharing and printing

After editing a strip, use **QR, download & print**.

### Storage (required for guest QR scans)

1. In the Vercel project, create a **Blob** store.
2. Copy the read/write token into `BLOB_READ_WRITE_TOKEN` (server only).
3. Set `NEXT_PUBLIC_SITE_URL` to `https://kixclicks.vercel.app` so QR codes never encode localhost.
4. Copy `.env.example` to `.env.local` for local development.

Shared strips are stored as PNG/JPEG objects with unguessable UUIDs. Links expire after **7 days**. Opening an expired link returns an expired state and attempts to delete the stored files. Camera frames stay in browser memory until a session is finished.

Without Blob configured, download and print still work on the booth computer. The result screen will show a sharing error instead of a scannable QR code.

### Local commands

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
```

### Testing QR sharing with a second phone

1. Deploy a preview (or production) that has Blob + `NEXT_PUBLIC_SITE_URL`.
2. Complete a strip and wait until the QR appears.
3. Scan with a different phone.
4. Confirm the URL is `/s/<uuid>` on the public origin, then download.

### Testing browser printing

1. On the result screen, choose **Print Photo Strip**.
2. Leave the method on **Browser / system printer**.
3. Choose copies (1–10). The OS dialog may still ask you to confirm copies.
4. Cancel or print. Opening the dialog is not treated as proof that paper came out.

### Direct thermal printers

A Vercel deployment cannot talk to USB/Bluetooth hardware. Use browser printing, or run `node print-bridge/server.mjs` on the computer attached to the printer, then add a vendor/ESC/POS adapter for that exact model. See `print-bridge/README.md`.

Do not push or promote to production until a preview deployment has been checked.
