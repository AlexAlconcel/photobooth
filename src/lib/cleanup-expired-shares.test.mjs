import assert from "node:assert/strict";
import test from "node:test";

test("expired registry records are eligible for cleanup", async () => {
  const { isExpired } = await import("./share-id.ts");
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(isExpired(past), true);
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(isExpired(future), false);
});

test("registry paths stay under kixclicks/registry", async () => {
  const { blobPathForRegistry, SHARE_REGISTRY_PREFIX } = await import("./share-id.ts");
  const id = "11111111-1111-4111-8111-111111111111";
  const path = blobPathForRegistry(id);
  assert.ok(path.startsWith(SHARE_REGISTRY_PREFIX));
  assert.ok(path.endsWith(`${id}.json`));
});
