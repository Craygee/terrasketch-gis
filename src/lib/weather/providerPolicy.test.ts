import assert from "node:assert/strict";
import test from "node:test";
import { approvedXweatherProducts, xweatherProductPermitted } from "./providerPolicy.server.ts";
import { publicProviderPermitted, weatherProviderRegistry } from "./providerRegistry.ts";
import {
  activeLicenseGrant,
  parseProviderPolicy,
  weatherFeatureEnabled,
} from "./providerPolicy.ts";
import { syntheticLicenseGrant, syntheticPolicyBindings } from "./policyFixtures.ts";
import { runWithWeatherContext } from "./runtimeContext.server.ts";

test("unknown commercial rights never become included public access", () => {
  assert.equal(publicProviderPermitted("xweather"), false);
  assert.equal(publicProviderPermitted("nonexistent"), false);
  assert.equal(publicProviderPermitted("open-meteo"), false);
  assert.equal(publicProviderPermitted("nws"), true);
  assert.equal(
    new Set(weatherProviderRegistry.map((item) => item.provider_id)).size,
    weatherProviderRegistry.length,
  );
});
test("server product approval is explicit and never accepts wildcard grants", () => {
  const bindings = syntheticPolicyBindings(
    syntheticLicenseGrant({ products: ["radar-global", "satellite"] }),
  );
  assert.deepEqual(approvedXweatherProducts(bindings), ["radar-global", "satellite"]);
  assert.equal(xweatherProductPermitted("lightning-flash", bindings), false);
  assert.equal(xweatherProductPermitted("radar-global", bindings), true);
  assert.equal(xweatherProductPermitted("radar-global", { WEATHER_PROVIDER_POLICY: "" }), false);
});

test("malformed, wildcard and incomplete approvals fail closed", () => {
  for (const raw of [
    "{",
    "[]",
    JSON.stringify({ version: 1, grants: [{ products: ["*"] }] }),
    JSON.stringify({ version: 1, grants: [syntheticLicenseGrant({ products: ["*"] })] }),
  ]) {
    assert.equal(parseProviderPolicy(raw).valid, false);
    assert.deepEqual(approvedXweatherProducts({ WEATHER_PROVIDER_POLICY: raw }), []);
  }
});
test("expired, future, revoked, wrong-product and cross-user grants are denied", () => {
  const grant = syntheticLicenseGrant({ scope: "user", subjectId: "user-a" });
  const { policy } = parseProviderPolicy(syntheticPolicyBindings(grant).WEATHER_PROVIDER_POLICY);
  const input = {
    providerId: "xweather",
    product: "radar-global",
    connectionType: "USER_BYOK" as const,
    userId: "user-a",
  };
  assert.ok(activeLicenseGrant(policy, input));
  assert.equal(activeLicenseGrant(policy, { ...input, userId: "user-b" }), undefined);
  assert.equal(
    activeLicenseGrant(policy, { ...input, connectionType: "LANDDRAFT_MANAGED" }),
    undefined,
  );
  assert.equal(activeLicenseGrant(policy, { ...input, product: "lightning-flash" }), undefined);
  assert.equal(activeLicenseGrant(policy, { ...input, now: Date.parse("2100-01-01") }), undefined);
  assert.equal(activeLicenseGrant(policy, { ...input, now: Date.parse("2019-01-01") }), undefined);
  policy.grants[0]!.revoked = true;
  assert.equal(activeLicenseGrant(policy, input), undefined);
});
test("provider kill switches override grants and experimental features stay off", () => {
  const { policy } = parseProviderPolicy(syntheticPolicyBindings().WEATHER_PROVIDER_POLICY);
  policy.disabledProviders.push("xweather");
  assert.equal(
    activeLicenseGrant(policy, {
      providerId: "xweather",
      product: "radar-global",
      connectionType: "USER_BYOK",
    }),
    undefined,
  );
  assert.equal(weatherFeatureEnabled(policy, "photography_heatmap"), false);
  assert.equal(weatherFeatureEnabled(policy, "experimental_tornado_analysis"), false);
  assert.equal(weatherFeatureEnabled(policy, "weather_provider_registry"), true);
});
test("concurrent request bindings cannot share license grants", async () => {
  const a = syntheticPolicyBindings();
  const b = { WEATHER_PROVIDER_POLICY: "" };
  const values = await Promise.all([
    runWithWeatherContext(a, new Request("https://example.test/a"), async () => {
      await Promise.resolve();
      return xweatherProductPermitted("radar-global");
    }),
    runWithWeatherContext(b, new Request("https://example.test/b"), async () => {
      await Promise.resolve();
      return xweatherProductPermitted("radar-global");
    }),
  ]);
  assert.deepEqual(values, [true, false]);
});
