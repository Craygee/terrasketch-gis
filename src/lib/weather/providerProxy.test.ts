import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptXweatherCredentials,
  handleXweatherConnection,
} from "./xweatherConnection.server.ts";
import { handleXweatherTileProxy, xweatherProviderHealth } from "./xweather.server.ts";
import { syntheticLicenseGrant, syntheticPolicyBindings } from "./policyFixtures.ts";

const credentials = { clientId: "fixture-client", clientSecret: "fixture-secret" };
const encryptionSecret = "fixture-encryption-secret-not-a-real-key";
const baseBindings = {
  SUPABASE_URL: "https://database.example.test",
  SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
  XWEATHER_CREDENTIAL_ENCRYPTION_KEY: encryptionSecret,
};
function tileRequest(user = "user-a") {
  return new Request(
    "https://landdraft.example.test/api/weather/xweather/tiles/radar-global/0/0/0/current.png",
    {
      headers: {
        Authorization: `Bearer ${user}`,
        Origin: "https://landdraft.example.test",
        "Sec-Fetch-Site": "same-origin",
      },
    },
  );
}

test("proxy enforces user grants, revocation and disconnect on every request", async (t) => {
  const encryptedA = await encryptXweatherCredentials(credentials, "user-a", encryptionSecret);
  const encryptedB = await encryptXweatherCredentials(credentials, "user-b", encryptionSecret);
  let connected = true;
  let vendorCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const user = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user });
    if (url.pathname === "/rest/v1/weather_provider_connections") {
      assert.equal(url.searchParams.get("user_id"), `eq.${user}`);
      return Response.json(
        connected
          ? [
              {
                encrypted_credentials: user === "user-a" ? encryptedA : encryptedB,
                client_id_hint: "fixture",
                status: "connected",
              },
            ]
          : [],
      );
    }
    assert.equal(url.hostname, "maps.api.xweather.com");
    vendorCalls++;
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png" },
    });
  });
  const grant = syntheticLicenseGrant({ scope: "user", subjectId: "user-a" });
  const bindings = { ...baseBindings, ...syntheticPolicyBindings(grant) };
  const success = await handleXweatherTileProxy(tileRequest(), bindings);
  assert.equal(success?.status, 200);
  assert.equal(success?.headers.get("cache-control"), "private, no-store");
  assert.equal((await handleXweatherTileProxy(tileRequest("user-b"), bindings))?.status, 403);
  bindings.WEATHER_PROVIDER_POLICY = syntheticPolicyBindings({
    ...grant,
    revoked: true,
  }).WEATHER_PROVIDER_POLICY;
  assert.equal((await handleXweatherTileProxy(tileRequest(), bindings))?.status, 403);
  bindings.WEATHER_PROVIDER_POLICY = syntheticPolicyBindings(grant).WEATHER_PROVIDER_POLICY;
  connected = false;
  assert.equal((await handleXweatherTileProxy(tileRequest(), bindings))?.status, 401);
  assert.equal(vendorCalls, 1);
  assert.equal(xweatherProviderHealth(true).lastSuccessfulRequest, undefined);
});

test("credential-bearing upstream errors never reach the client", async (t) => {
  const encrypted = await encryptXweatherCredentials(
    credentials,
    "redaction-user",
    encryptionSecret,
  );
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "redaction-user" });
    if (url.pathname === "/rest/v1/weather_provider_connections")
      return Response.json([
        { encrypted_credentials: encrypted, client_id_hint: "fixture", status: "connected" },
      ]);
    throw new Error(`Sensitive upstream URL ${url.href}`);
  });
  const result = await handleXweatherTileProxy(tileRequest("redaction-user"), {
    ...baseBindings,
    ...syntheticPolicyBindings(),
  });
  assert.equal(result?.status, 502);
  const body = await result!.text();
  assert.equal(body.includes(credentials.clientSecret), false);
  assert.equal(body.includes("maps.api.xweather.com"), false);
});

test("rate-limited key tests do not verify entitlements or save credentials", async (t) => {
  let saves = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "rate-test-user" });
    if (url.hostname === "maps.api.xweather.com") return new Response("fixture", { status: 429 });
    if (init?.method === "POST") saves++;
    return Response.json([]);
  });
  const request = new Request("https://landdraft.example.test/api/weather/xweather/connection", {
    method: "POST",
    headers: { Authorization: "Bearer rate-test-user", Origin: "https://landdraft.example.test" },
    body: JSON.stringify(credentials),
  });
  const result = await handleXweatherConnection(request, {
    ...baseBindings,
    ...syntheticPolicyBindings(),
  });
  assert.equal(result?.status, 400);
  assert.equal(saves, 0);
  assert.match(await result!.text(), /could not be verified/);
});
