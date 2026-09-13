import assert from "node:assert/strict";
import test from "node:test";
import { xweatherRasterFramesFor, xweatherTileTemplate } from "./xweather.server.ts";
import { XWEATHER_ADDITIONAL_LAYERS } from "./xweatherCatalog.ts";
import { syntheticLicenseGrant, syntheticPolicyBindings } from "./policyFixtures.ts";
import {
  decryptXweatherCredentials,
  encryptXweatherCredentials,
  parseXweatherApiKey,
} from "./xweatherConnection.server.ts";

test("commercial frames require both connection and deployment product approval", () => {
  const request = {
    latitude: 31.9,
    longitude: -102.1,
    requestedLayerIds: ["weather.xweather.current.temperature"],
  };
  assert.equal(xweatherRasterFramesFor(request).length, 0);
  const prior = process.env["WEATHER_PROVIDER_POLICY"];
  try {
    process.env["WEATHER_PROVIDER_POLICY"] = "";
    assert.equal(xweatherRasterFramesFor({ ...request, xweatherConnected: true }).length, 0);
    const product = XWEATHER_ADDITIONAL_LAYERS.find(
      (layer) => layer.id === request.requestedLayerIds[0],
    )!.providerLayer;
    process.env["WEATHER_PROVIDER_POLICY"] = syntheticPolicyBindings(
      syntheticLicenseGrant({ products: [product] }),
    ).WEATHER_PROVIDER_POLICY;
    assert.ok(xweatherRasterFramesFor({ ...request, xweatherConnected: true }).length > 0);
  } finally {
    if (prior === undefined) delete process.env["WEATHER_PROVIDER_POLICY"];
    else process.env["WEATHER_PROVIDER_POLICY"] = prior;
  }
});

test("encrypts Xweather credentials for one user and rejects a different user", async () => {
  const credentials = { clientId: "test-client", clientSecret: "test-secret" };
  const encrypted = await encryptXweatherCredentials(credentials, "user-a", "test-master-key");
  assert.equal(encrypted.includes(credentials.clientId), false);
  assert.equal(encrypted.includes(credentials.clientSecret), false);
  assert.deepEqual(
    await decryptXweatherCredentials(encrypted, "user-a", "test-master-key"),
    credentials,
  );
  await assert.rejects(decryptXweatherCredentials(encrypted, "user-b", "test-master-key"));
});

test("parses the combined API key issued by the current Xweather dashboard", () => {
  assert.deepEqual(parseXweatherApiKey("client-part_secret-part_with-characters"), {
    clientId: "client-part",
    clientSecret: "secret-part_with-characters",
  });
  assert.equal(parseXweatherApiKey("missing-separator"), null);
  assert.equal(parseXweatherApiKey("_missing-client"), null);
});

test("browser tile templates use the authenticated protocol and contain no provider credential", () => {
  const template = xweatherTileTemplate("radar-global", "current");
  assert.equal(template, "landdraft-xweather://tiles/radar-global/{z}/{x}/{y}/current.png");
  assert.equal(template.includes("client"), false);
  assert.equal(template.includes("secret"), false);
});

test("forecast tile templates preserve provider-relative future offsets", () => {
  assert.equal(
    xweatherTileTemplate("ftemperatures", "+6hours"),
    "landdraft-xweather://tiles/ftemperatures/{z}/{x}/{y}/+6hours.png",
  );
});

test("Xweather catalog has stable unique LandDraft ids and valid provider metadata", () => {
  assert.ok(XWEATHER_ADDITIONAL_LAYERS.length >= 60);
  assert.equal(
    new Set(XWEATHER_ADDITIONAL_LAYERS.map((layer) => layer.id)).size,
    XWEATHER_ADDITIONAL_LAYERS.length,
  );
  for (const layer of XWEATHER_ADDITIONAL_LAYERS) {
    assert.match(layer.id, /^weather\.xweather\./);
    assert.match(layer.providerLayer, /^[a-z0-9-]+$/);
    assert.ok(layer.coverage.length > 0);
    assert.ok(layer.offsets.length > 0);
    assert.ok([1, 5, 10].includes(layer.costMultiplier));
  }
  assert.equal(
    XWEATHER_ADDITIONAL_LAYERS.some((layer) =>
      ["precip-1h", "snow-depth-global"].includes(layer.providerLayer),
    ),
    false,
  );
});
