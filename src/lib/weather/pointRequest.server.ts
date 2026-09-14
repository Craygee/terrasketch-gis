import { validatePoint } from "./pointRequest.ts";
import { loadWeatherBundle } from "./gateway.server.ts";
import { consumeProviderRequest } from "./providerOperations.server.ts";
export async function handleWeatherPointRequest(request: Request): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/weather/point") return null;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Forbidden", { status: 403 });
  if (
    !consumeProviderRequest("point:" + (request.headers.get("cf-connecting-ip") ?? "local"), "tile")
  )
    return new Response("Too many requests", { status: 429 });
  let point;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return new Response("Request too large", { status: 413 });
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    point = validatePoint(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return new Response("Invalid weather point", { status: 400 });
  }
  try {
    return Response.json(await loadWeatherBundle(point), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Weather data temporarily unavailable", { status: 502 });
  }
}
