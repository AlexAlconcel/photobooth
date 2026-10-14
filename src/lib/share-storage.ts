export function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Guest QR links need durable storage; in-memory strips do not survive serverless. */
export function requiresBlobForShare() {
  return Boolean(process.env.VERCEL);
}
