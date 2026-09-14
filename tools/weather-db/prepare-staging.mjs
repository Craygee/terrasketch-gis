import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Run only after verifying the designated test credential store is empty.
// Exclusive creation prevents accidentally replacing an existing encryption key.
const publicKey = process.argv[2];
if (!publicKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)) {
  throw new Error("Supply the designated test project's public publishable key.");
}
const policy = JSON.parse(
  await readFile(
    new URL("../../docs/weather-provider-policy.example.json", import.meta.url),
    "utf8",
  ),
);
if (policy.grants.length !== 0)
  throw new Error("Staging initialization must not grant commercial rights.");
const configuration = [
  "# Local staging only. Never commit or copy this key into a different credential store.",
  "VITE_SUPABASE_URL=https://unuxnecqjvmtztxxqudb.supabase.co",
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
  `XWEATHER_CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("base64url")}`,
  `WEATHER_PROVIDER_POLICY=${JSON.stringify(policy)}`,
  "WEATHER_ENABLE_OPEN_METEO_EVALUATION=false",
  "",
].join("\n");
await writeFile(new URL("../../.env.weather-staging.local", import.meta.url), configuration, {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Created ignored staging configuration with a new server-only encryption key and zero commercial grants. No secrets printed.",
);
