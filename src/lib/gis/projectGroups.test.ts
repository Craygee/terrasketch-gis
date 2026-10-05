import test from "node:test";
import assert from "node:assert/strict";
import { createCoreLayerGroups, ensureCoreLayerGroups } from "./projectGroups.ts";

test("restores the imported-files group in older projects", () => {
  const result = ensureCoreLayerGroups([
    { id: "working", name: "Working layers", collapsed: true },
    { id: "sketch", name: "My sketches", collapsed: false },
    { id: "public", name: "Public data", collapsed: false },
  ]);

  assert.deepEqual(
    result.map((group) => group.id),
    ["working", "sketch", "design", "imports", "public"],
  );
  assert.equal(result.find((group) => group.id === "imports")?.name, "Imported files");
  assert.equal(result.find((group) => group.id === "working")?.collapsed, true);
});

test("preserves custom group order and never duplicates core groups", () => {
  const groups = [
    { id: "working", name: "Renamed working", collapsed: false },
    { id: "custom", name: "Survey review", collapsed: true },
    { id: "imports", name: "My imported data", collapsed: true },
  ];
  const result = ensureCoreLayerGroups(groups);

  assert.equal(result.filter((group) => group.id === "imports").length, 1);
  assert.ok(
    result.findIndex((group) => group.id === "working") <
      result.findIndex((group) => group.id === "custom"),
  );
  assert.ok(
    result.findIndex((group) => group.id === "custom") <
      result.findIndex((group) => group.id === "imports"),
  );
  assert.equal(result.find((group) => group.id === "imports")?.collapsed, true);
});

test("returns new objects for safe state initialization", () => {
  const first = createCoreLayerGroups();
  const second = createCoreLayerGroups();
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
});
