import { readFile, appendFile } from "node:fs/promises";

const latest = JSON.parse(await readFile(".data/texas-parcels/latest-check.json", "utf8"));
const response = await fetch(
  "https://landdraft-public-parcels.tight-sky-0ae1.workers.dev/texas/current.json",
);
const current = response.ok ? await response.json() : null;
const sourceChanged =
  current?.sourceEtag !== latest.etag || current?.collectionId !== latest.collection.collection_id;
const searchBackfill =
  !sourceChanged && (current?.search?.status !== "ready" || current?.search?.schemaVersion !== 2);
const mode = sourceChanged ? "full" : searchBackfill ? "search-only" : "unchanged";
const needed = mode !== "unchanged";
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `needed=${needed}\nmode=${mode}\n`);
console.log(
  mode === "full"
    ? "New public archive requires spatial and search indexing"
    : mode === "search-only"
      ? "Hosted archive requires the statewide attribute-search backfill"
      : "Publisher archive and search index are current",
);
