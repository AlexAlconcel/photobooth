/** Connected Blob store id (Vercel sets BLOB_STORE_ID when the store is linked). */
export function blobStoreId() {
  return process.env.BLOB_STORE_ID?.trim() || "";
}

export function hasBlobReadWriteToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** True when server uploads can reach Vercel Blob (OIDC store link or legacy token). */
export function hasBlobStorageConfigured() {
  return Boolean(blobStoreId() || hasBlobReadWriteToken());
}

/** Guest QR links need durable storage; in-memory strips do not survive serverless. */
export function requiresBlobForShare() {
  return Boolean(process.env.VERCEL);
}

/**
 * Auth options for @vercel/blob server SDK calls.
 * When BLOB_STORE_ID is set, rely on VERCEL_OIDC_TOKEN (injected on Vercel or via `vercel env pull` locally).
 * Do not pass BLOB_READ_WRITE_TOKEN in that case — explicit token overrides OIDC in the SDK.
 */
export function blobSdkOptions() {
  const storeId = blobStoreId();
  if (storeId) {
    return { storeId };
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    return { token };
  }
  return {};
}

export function blobStorageSetupMessage() {
  if (requiresBlobForShare()) {
    return "Connect your Vercel Blob store to this project (BLOB_STORE_ID is set automatically). Redeploy after connecting. A long-lived BLOB_READ_WRITE_TOKEN is not required when OIDC is enabled.";
  }
  return "For local QR sharing, run `vercel env pull` to load BLOB_STORE_ID and VERCEL_OIDC_TOKEN, or set BLOB_READ_WRITE_TOKEN in .env.local.";
}
