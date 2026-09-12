import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const allowedBranch = process.env.LANDDRAFT_PREVIEW_BRANCH ?? "feature/test-module-development";
const workerName = process.env.LANDDRAFT_PREVIEW_WORKER ?? "landdraft-preview";

const readGitBranch = () => {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
};

const currentBranch =
  process.env.WORKERS_CI_BRANCH ?? process.env.GITHUB_REF_NAME ?? readGitBranch();

if (currentBranch !== allowedBranch) {
  throw new Error(
    `Refusing preview deployment from ${currentBranch || "an unknown branch"}. Expected ${allowedBranch}.`,
  );
}

const configUrl = new URL("../.output/server/wrangler.json", import.meta.url);
const headersUrl = new URL("../.output/public/_headers", import.meta.url);
const configPath = fileURLToPath(configUrl);
const config = JSON.parse(await readFile(configUrl, "utf8"));

config.name = workerName;
config.workers_dev = true;
config.preview_urls = true;
config.vars = {
  ...(config.vars ?? {}),
  // The published Spotter Network position feed is non-commercial. This flag
  // is deliberately added only by the isolated preview-deployment guard and
  // must not be copied into production without provider permission.
  SPOTTER_NETWORK_NONCOMMERCIAL_FEED_ENABLED: "true",
};

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const headers = await readFile(headersUrl, "utf8").catch(() => "");
if (!headers.includes("X-Robots-Tag: noindex")) {
  const separator = headers && !headers.endsWith("\n") ? "\n" : "";
  await writeFile(
    headersUrl,
    `${headers}${separator}\n/*\n  X-Robots-Tag: noindex, nofollow\n`,
    "utf8",
  );
}

console.log(`Prepared ${workerName} from ${currentBranch}.`);
