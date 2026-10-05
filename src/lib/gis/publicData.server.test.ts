import assert from "node:assert/strict";
import test from "node:test";

import { handlePublicDataDownload } from "./publicData.server.ts";

test("proxies the fixed official Census state-boundary archive", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (input) => {
    requested = String(input);
    return new Response(new Uint8Array([80, 75, 3, 4]), {
      headers: { "content-type": "application/zip", "content-length": "4" },
    });
  };
  try {
    const response = await handlePublicDataDownload(
      new Request("https://landdraft.test/api/public-data/census-state-boundaries"),
    );
    assert.ok(response);
    assert.equal(response.status, 200);
    assert.match(requested, /cb_2025_us_state_500k\.zip$/);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.match(response.headers.get("content-disposition") ?? "", /cb_2025_us_state_500k/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not handle unrelated paths", async () => {
  assert.equal(
    await handlePublicDataDownload(new Request("https://landdraft.test/api/other")),
    null,
  );
});
