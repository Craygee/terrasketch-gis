import test from "node:test";
import assert from "node:assert/strict";
import {
  searchTexasParcels,
  validateTexasParcelSearch,
  type TexasParcelSearchResponse,
} from "./parcelSearch.ts";

test("parcel search requires a useful statewide filter", () => {
  assert.match(validateTexasParcelSearch({}) ?? "", /at least one/i);
  assert.match(validateTexasParcelSearch({ block: "12" }) ?? "", /county/i);
  assert.match(validateTexasParcelSearch({ owner: "SM" }) ?? "", /at least 3/i);
  assert.equal(validateTexasParcelSearch({ county: "Travis", block: "B" }), null);
  assert.equal(validateTexasParcelSearch({ parcelId: "102197" }), null);
});

test("parcel search sends bounded filters and preserves missing values", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/texas/search");
    assert.equal(url.searchParams.get("county"), "Travis");
    assert.equal(url.searchParams.get("owner"), "Miller");
    assert.equal(url.searchParams.get("limit"), "50");
    const body: TexasParcelSearchResponse = {
      results: [
        {
          county: "TRAVIS",
          fips: "48453",
          propertyId: "102197",
          ownerName: "MILLER JAMES & AUDREY",
          bounds: [-97.8, 30.2, -97.79, 30.21],
        },
      ],
      limited: false,
      sourceDate: "2025-06-01",
      searched: { county: "Travis", owner: "Miller" },
    };
    return Response.json(body);
  });
  const response = await searchTexasParcels({ county: "Travis", owner: "Miller", limit: 999 });
  assert.equal(response.results[0]?.propertyId, "102197");
  assert.equal(response.results[0]?.geoId, undefined);
});
