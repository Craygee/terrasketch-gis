import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recoverSnapshot } from "./snapshotRecovery.ts";

const missing = Object.assign(new Error("Object not found"), { status: 400 });
test("healthy latest snapshot is used without falling back", async () => {
  const calls: string[] = [];
  const result = await recoverSnapshot(
    "current",
    [{ storagePath: "old", savedAt: 1 }],
    async (p) => {
      calls.push(p);
      return { name: p };
    },
  );
  assert.deepEqual(calls, ["current"]);
  assert.equal(result.recoveredAt, null);
});
test("missing current snapshot recovers newest intact version without duplicate reads", async () => {
  const calls: string[] = [];
  const result = await recoverSnapshot(
    "missing",
    [
      { storagePath: "old", savedAt: 1 },
      { storagePath: "missing", savedAt: 3 },
      { storagePath: "newer", savedAt: 2 },
    ],
    async (p) => {
      calls.push(p);
      if (p === "missing") throw missing;
      return p;
    },
  );
  assert.equal(result.state, "newer");
  assert.equal(result.recoveredAt, 2);
  assert.deepEqual(calls, ["missing", "newer"]);
});
test("all missing snapshots produce a recoverable workspace message, not an empty map", async () => {
  await assert.rejects(
    recoverSnapshot("missing", [{ storagePath: "also-missing", savedAt: 1 }], async () => {
      throw missing;
    }),
    /project entry has been preserved/,
  );
});
test("permission and network failures never trigger stale-version fallback", async () => {
  for (const status of [401, 403, 500]) {
    let calls = 0;
    await assert.rejects(
      recoverSnapshot("current", [{ storagePath: "old", savedAt: 1 }], async () => {
        calls++;
        throw Object.assign(new Error("Failure"), { status });
      }),
      /Failure/,
    );
    assert.equal(calls, 1);
  }
});
test("snapshot save no longer garbage-collects concurrent or retained uploads", () => {
  const code = readFileSync(new URL("./project.ts", import.meta.url), "utf8");
  const save = code.slice(code.indexOf("  async save("), code.indexOf("  async save(") + 1800);
  assert.doesNotMatch(
    save,
    /cleanUnusedSnapshots|deletePrivateProjectFiles|listPrivateProjectFiles/,
  );
});
