// Shared request gate. No credential or access decision is cached across requests.
export type AccessConfig = { enabled: boolean; url?: string; key?: string };
export async function checkAccess(config: AccessConfig, token: string, module: string | null, fetcher = fetch) {
  if (!config.enabled) return { allowed: true, active: false };
  if (!config.url || !config.key || !token || token.length > 8192 || /\s/.test(token))
    return { allowed: false, active: true };
  const response = await fetcher(`${config.url.replace(/\/$/, '')}/rest/v1/rpc/landdraft_access_status`, {
    method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_module: module }), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { allowed: false, active: true };
  const result = await response.json() as { allowed?: boolean; active?: boolean };
  return { allowed: result.allowed === true && result.active === true, active: true };
}
export function requestToken(request: Request) {
  const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')?.[1];
  if (bearer) return bearer;
  return request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('__Host-landdraft_access='))?.slice('__Host-landdraft_access='.length) || '';
}
export async function accessMiddleware(request: Request, config: AccessConfig, fetcher = fetch): Promise<Response | null> {
  if (!config.enabled) return null;
  const path = new URL(request.url).pathname;
  if (path === '/api/access/session') {
    if (request.method !== 'POST' || request.headers.get('origin') !== new URL(request.url).origin)
      return new Response('Forbidden', { status: 403 });
    // Credentials stay in an HttpOnly, Secure, host-only session cookie for tile and server-function requests.
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')?.[1] || '';
    const module = new URL(request.url).searchParams.get('module') || 'mapping.core';
    try {
      const result = await checkAccess(config, token, module, fetcher);
      return Response.json(result, { status: result.allowed ? 200 : 403, headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': result.allowed ? `__Host-landdraft_access=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=300` : '__Host-landdraft_access=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
      }});
    } catch { return new Response('Access service unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  }
  if (!path.startsWith('/api/') && !path.startsWith('/_server')) return null;
  try {
    const module = path.startsWith('/api/weather/') ? 'weather.core' : path.startsWith('/api/water/') ? 'water.hydrogeology' : 'mapping.core';
    if ((await checkAccess(config, requestToken(request), module, fetcher)).allowed) return null;
    return new Response('LandDraft access restricted', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  } catch { return new Response('Access service unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
