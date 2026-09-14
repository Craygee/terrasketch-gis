import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as recovery from "./snapshotRecovery.ts";

function fixture(currentExists = false, olderExists = true) {
  const snapshots = new Map();
  const original = {
    version: 1,
    name: "Preserved map",
    layers: [],
    groups: [],
    mapView: { center: [-98, 31], zoom: 8 },
  };
  if (currentExists)
    snapshots.set("current.json", new TextEncoder().encode(JSON.stringify(original)).buffer);
  if (olderExists)
    snapshots.set("older.json", new TextEncoder().encode(JSON.stringify(original)).buffer);
  const calls = [];
  const row = {
    id: "project-one",
    owner_id: "owner",
    name: original.name,
    autosave: true,
    state_path: "current.json",
    created_at: "2026-01-01",
    updated_at: "2026-09-13",
    parent_project_id: null,
    map_view: original.mapView,
  };
  const cloud = {
    cloudConfigured: true,
    async cloudDataRequest(path, init) {
      calls.push({ path, method: init?.method ?? "GET" });
      if (path.includes("project_versions"))
        return [{ id: "v1", saved_at: "2026-09-12", reason: "manual", state_path: "older.json" }];
      if (path.includes("save_project_snapshot"))
        row.state_path = JSON.parse(init.body).p_state_path;
      return [row];
    },
    async downloadPrivateProjectFile(path) {
      if (!snapshots.has(path)) throw Object.assign(new Error("Object not found"), { status: 400 });
      return snapshots.get(path);
    },
    async uploadPrivateProjectFile(path, blob) {
      snapshots.set(path, await blob.arrayBuffer());
    },
    async listPrivateProjectFiles() {
      throw new Error("Unexpected destructive cleanup");
    },
    async deletePrivateProjectFiles() {
      throw new Error("Unexpected deletion");
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("./project.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id) =>
      id === "@/lib/cloud"
        ? cloud
        : id === "./snapshotRecovery"
          ? recovery
          : { LANDDRAFT_APP_VERSION: "test", projectVersionLabel: () => "test" },
    window: { crypto: webcrypto },
    Blob,
    Response,
    TextEncoder,
    TextDecoder,
    console,
  });
  return { store: module.exports.workspaceProjectStore, calls, original };
}
test("actual project loader opens an intact earlier snapshot with autosave paused and no cloud writes", async () => {
  const { store, calls } = fixture();
  const result = await store.loadLast("owner");
  assert.equal(result.state.name, "Preserved map");
  assert.equal(result.autosave, false);
  assert.match(result.recoveryNotice, /Autosave is paused/);
  assert.ok(calls.every((c) => c.method === "GET"));
});
test("actual loader preserves healthy project autosave", async () => {
  const { store } = fixture(true);
  assert.equal((await store.loadLast("owner")).autosave, true);
});
test("actual loader does not fabricate a blank project when all objects are missing", async () => {
  const { store, calls } = fixture(false, false);
  await assert.rejects(store.loadLast("owner"), /project entry has been preserved/);
  assert.ok(calls.every((c) => c.method === "GET"));
});
test("actual save uploads and loads its snapshot without browser garbage collection", async () => {
  const { store, original } = fixture();
  const saved = await store.save("owner", "project-one", original, "manual");
  assert.equal(saved.state.name, original.name);
  assert.equal(saved.recoveryNotice, undefined);
});
