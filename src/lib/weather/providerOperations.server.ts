export interface ProviderAuditEvent {
  correlationId: string;
  providerId: string;
  subjectId: string;
  action: "connect" | "disconnect" | "test" | "tile";
  outcome: "success" | "denied" | "failed";
  occurredAt: string;
}
const events: ProviderAuditEvent[] = [];
const requestWindows = new Map<string, { count: number; endsAt: number }>();
/** Bounded process-local protection. Hosted deployments also need an edge rate-limit rule. */
export function consumeProviderRequest(
  subjectId: string,
  action: "tile" | "connection",
  now = Date.now(),
): boolean {
  const key = `${subjectId}:${action}`;
  const limit = action === "tile" ? 600 : 12;
  const current = requestWindows.get(key);
  if (current && current.endsAt > now) {
    if (current.count >= limit) return false;
    current.count++;
    return true;
  }
  if (requestWindows.size >= 2000) {
    for (const [id, item] of requestWindows) if (item.endsAt <= now) requestWindows.delete(id);
    if (requestWindows.size >= 2000) return false;
  }
  requestWindows.set(key, { count: 1, endsAt: now + 60_000 });
  return true;
}
export function recordProviderAudit(input: Omit<ProviderAuditEvent, "occurredAt">) {
  // Explicit field copying: never spread request payloads, URLs, keys or raw errors.
  events.push({
    correlationId: input.correlationId,
    providerId: input.providerId,
    subjectId: input.subjectId,
    action: input.action,
    outcome: input.outcome,
    occurredAt: new Date().toISOString(),
  });
  if (events.length > 500) events.splice(0, events.length - 500);
}
export function providerAuditForSubject(subjectId: string): ProviderAuditEvent[] {
  const cutoff = Date.now() - 86400_000;
  return events
    .filter((event) => event.subjectId === subjectId && Date.parse(event.occurredAt) > cutoff)
    .map((event) => ({ ...event }));
}
export async function readConnectionBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("A connection request is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > 2048) {
        await reader.cancel();
        throw new Error("Connection request is too large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (result && typeof result === "object" && !Array.isArray(result))
      return result as Record<string, unknown>;
  } catch {
    /* Never echo payloads, which can include credentials. */
  }
  throw new Error("Invalid connection request");
}
