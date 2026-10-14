import assert from "node:assert/strict";
import test from "node:test";

test("blobSdkOptions prefers storeId over read-write token", async () => {
  const prevStore = process.env.BLOB_STORE_ID;
  const prevToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_STORE_ID = "store_test123";
  process.env.BLOB_READ_WRITE_TOKEN = "rw_legacy";

  const { blobSdkOptions } = await import("./blob-auth.ts");
  assert.deepEqual(blobSdkOptions(), { storeId: "store_test123" });

  process.env.BLOB_STORE_ID = "";
  assert.deepEqual(blobSdkOptions(), { token: "rw_legacy" });

  process.env.BLOB_READ_WRITE_TOKEN = "";
  assert.deepEqual(blobSdkOptions(), {});

  if (prevStore === undefined) delete process.env.BLOB_STORE_ID;
  else process.env.BLOB_STORE_ID = prevStore;
  if (prevToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = prevToken;
});
