import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeProviderRequest,
  readConnectionBody,
  recordProviderAudit,
  providerAuditForSubject,
} from "./providerOperations.server.ts";
test("connection request limits cannot be bypassed by missing content-length", async () => {
  await assert.rejects(
    readConnectionBody(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ apiKey: "x".repeat(4096) }),
      }),
    ),
    /too large/,
  );
  await assert.rejects(
    readConnectionBody(
      new Request("https://example.test", { method: "POST", body: "not-json-with-secret" }),
    ),
    /Invalid connection request/,
  );
});
test("rate windows are separate by user and reset", () => {
  for (let i = 0; i < 12; i++)
    assert.equal(consumeProviderRequest("rate-user-a", "connection", 100), true);
  assert.equal(consumeProviderRequest("rate-user-a", "connection", 100), false);
  assert.equal(consumeProviderRequest("rate-user-b", "connection", 100), true);
  assert.equal(consumeProviderRequest("rate-user-a", "connection", 60101), true);
});
test("audit fields exclude extra payloads and isolate subjects", () => {
  const input = {
    correlationId: "test-correlation",
    providerId: "xweather",
    subjectId: "audit-user-a",
    action: "test" as const,
    outcome: "success" as const,
    apiKey: "secret-value",
    latitude: 32,
  };
  recordProviderAudit(input);
  assert.equal(
    JSON.stringify(providerAuditForSubject("audit-user-a")).includes("secret-value"),
    false,
  );
  assert.equal(JSON.stringify(providerAuditForSubject("audit-user-a")).includes("latitude"), false);
  assert.deepEqual(providerAuditForSubject("audit-user-b"), []);
});
