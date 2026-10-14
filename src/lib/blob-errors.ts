import { BlobError } from "@vercel/blob";

export function formatBlobUploadError(error: unknown) {
  if (error instanceof BlobError) {
    const detail = error.message.toLowerCase();
    if (detail.includes("token") || detail.includes("oidc") || detail.includes("unauthorized")) {
      return "Blob storage could not authenticate. Confirm the store is connected to this Vercel project and redeploy (OIDC uses BLOB_STORE_ID, not a manual token).";
    }
    if (detail.includes("store") && detail.includes("not found")) {
      return "The linked Blob store could not be found. Reconnect the store in Vercel Storage and redeploy.";
    }
    return `Cloud storage rejected the upload: ${error.message}`;
  }
  if (error instanceof Error && error.message) {
    return `The photo strip could not be saved: ${error.message}`;
  }
  return "The photo strip could not be saved to cloud storage. Try again in a moment.";
}
