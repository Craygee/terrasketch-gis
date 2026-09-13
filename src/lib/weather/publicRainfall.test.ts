import test from "node:test";
import assert from "node:assert/strict";
import {
  rainfallFrames,
  rainfallSample,
  rainfallRenderingRule,
  rainfallLayers,
} from "./publicRainfall.ts";
import { weatherProductRegistry } from "./productRegistry.ts";
import { normalizeWeatherWorkspace } from "./model.ts";
import { defaultWeatherTimeline } from "./model.ts";
import { rainfallVisible } from "./publicRainfall.ts";
import { loadPublicRainfall } from "./publicRainfall.server.ts";

const now = Date.parse("2026-09-13T12:10:00Z");
const item = (hours: string, time = now - 600000, id = 1) => ({
  attributes: { objectid: id, idp_subset: `conus_QPE_${hours}H`, idp_validendtime: time },
});
test("rainfall locks the requested accumulation to real source time and original colors", () => {
  const frames = rainfallFrames(
    [item("01"), item("24", now - 600000, 2)],
    ["weather.rainfall.24h"],
    now,
  );
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.timestamp, "2026-09-13T12:00:00.000Z");
  const url = new URL(frames[0]!.tileUrlTemplate);
  assert.deepEqual(JSON.parse(url.searchParams.get("mosaicRule")!).lockRasterIds, [2]);
  assert.deepEqual(JSON.parse(url.searchParams.get("renderingRule")!), rainfallRenderingRule());
  assert.equal(url.searchParams.get("bbox"), "{bbox-epsg-3857}");
});
test("stale, future, unrelated and absent accumulations do not fabricate frames", () => {
  assert.deepEqual(
    rainfallFrames(
      [item("01", now - 3 * 3600000), item("24", now + 3600000)],
      ["weather.rainfall.1h", "weather.rainfall.24h"],
      now,
    ),
    [],
  );
  assert.deepEqual(rainfallFrames([item("01")], ["weather.rainfall.72h"], now), []);
});
test("regional updates never mix timestamps", () => {
  const old = item("01", now - 3600000, 2);
  old.attributes.idp_subset = "hawaii_QPE_01H";
  const [frame] = rainfallFrames([item("01"), old], ["weather.rainfall.1h"], now);
  assert.deepEqual(
    JSON.parse(new URL(frame!.tileUrlTemplate).searchParams.get("mosaicRule")!).lockRasterIds,
    [1],
  );
});
test("point samples preserve zero and reject missing and sentinel values", () => {
  assert.equal(rainfallSample("0"), 0);
  assert.equal(rainfallSample("25.4"), 1);
  assert.ok(Math.abs(rainfallSample("18.300001144")! - 0.720472486) < 0.000001);
  for (const value of [null, undefined, "", " ", "NoData", -9999, NaN, Infinity, true])
    assert.equal(rainfallSample(value), undefined);
});
test("active catalog contains no external paid weather products", () => {
  assert.ok(
    weatherProductRegistry.every(
      (product) => product.connectionType !== "USER_BYOK" && product.providerId !== "xweather",
    ),
  );
  for (const layer of rainfallLayers)
    assert.equal(
      weatherProductRegistry.find((product) => product.id === layer.id)?.providerId,
      "mrms",
    );
  assert.ok(
    !Object.keys(normalizeWeatherWorkspace(undefined).layerSettings).some((id) =>
      id.startsWith("weather.xweather."),
    ),
  );
});

test("latest accumulation cannot masquerade as historical or future rainfall", () => {
  const [frame] = rainfallFrames([item("01")], ["weather.rainfall.1h"], now);
  const timeline = { ...defaultWeatherTimeline(), selectedTime: new Date(now).toISOString() };
  assert.equal(rainfallVisible(frame!, timeline, now), true);
  assert.equal(rainfallVisible(frame!, { ...timeline, mode: "historical" }, now), false);
  assert.equal(rainfallVisible(frame!, { ...timeline, mode: "forecast" }, now), false);
  assert.equal(
    rainfallVisible(frame!, { ...timeline, selectedTime: "2026-09-13T11:00:00Z" }, now),
    false,
  );
  assert.equal(rainfallVisible(frame!, timeline, now + 3 * 3600000), false);
});

test("sample outage preserves imagery and exposes unavailable instead of dry", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/query"))
      return Response.json({ features: [item("01", Date.now() - 600000)] });
    assert.equal(url.pathname.endsWith("/getSamples"), true);
    return Response.json({ error: { message: "Temporarily unavailable" } });
  });
  const frames = await loadPublicRainfall(
    { longitude: -90, latitude: 35, requestedLayerIds: ["weather.rainfall.1h"] },
    AbortSignal.timeout(1000),
  );
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.pointSample!.value, null);
});
