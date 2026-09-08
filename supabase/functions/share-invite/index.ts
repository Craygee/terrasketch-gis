const RESEND_EMAILS_API = "https://api.resend.com/emails";
const DEFAULT_SITE_URL = "https://landdraft.net/";
const DEFAULT_FROM_EMAIL = "LandDraft <accounts@notify.landdraft.net>";

type ShareRole = "viewer" | "editor" | "admin";

interface InviteRequest {
  shareId?: string;
  email?: string;
  role?: ShareRole;
}

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface ShareRow {
  id: string;
  name: string;
}

interface MemberRow {
  id: string;
  share_id: string;
  user_id: string | null;
  invited_email: string;
  role: ShareRole;
  active: boolean;
  accepted_at: string | null;
}

const roleNames: Record<ShareRole, string> = {
  viewer: "view-only",
  editor: "editor-copy",
  admin: "administrator",
};

const roleDescriptions: Record<ShareRole, string> = {
  viewer: "You can explore the shared map, switch layers, inspect attributes, and print it.",
  editor: "You can create a separate editable copy for the map administrator to review.",
  admin: "You can directly edit the shared project and manage its sharing settings.",
};

const corsOrigin = (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  return origin === "https://landdraft.net" ||
    origin.endsWith(".lovable.app") ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ? origin
    : "https://landdraft.net";
};

const headers = (request: Request) => ({
  "Access-Control-Allow-Origin": corsOrigin(request),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  Vary: "Origin",
});

const json = (request: Request, body: unknown, status = 200) =>
  Response.json(body, { status, headers: headers(request) });

const readPublicKey = () => {
  const direct = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!keys) return "";
  try {
    return (JSON.parse(keys) as Record<string, string>)["default"] ?? "";
  } catch {
    return "";
  }
};

const responseError = async (response: Response) => {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const value = body["message"] ?? body["error_description"] ?? body["error"] ?? body["msg"];
    return typeof value === "string" ? value : fallback;
  } catch {
    return fallback;
  }
};

const authenticate = async (
  request: Request,
  supabaseUrl: string,
  publicKey: string,
): Promise<AuthUser | null> => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || !supabaseUrl || !publicKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publicKey, authorization },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as AuthUser;
  return user.id ? user : null;
};

const authenticatedRequest = (
  request: Request,
  publicKey: string,
  headers: Record<string, string> = {},
) => ({
  ...headers,
  apikey: publicKey,
  authorization: request.headers.get("authorization") ?? "",
  "Content-Type": "application/json",
});

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );

const inviterName = (user: AuthUser) => {
  const metadataName = user.user_metadata?.["full_name"] ?? user.user_metadata?.["name"];
  return typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim().slice(0, 120)
    : user.email?.trim() || "A LandDraft user";
};

const subjectText = (value: string) =>
  value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 160);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publicKey = readPublicKey();
    const user = await authenticate(request, supabaseUrl, publicKey);
    if (!user) return json(request, { error: "Sign in again before sharing a map" }, 401);

    const body = (await request.json()) as InviteRequest;
    const shareId = body.shareId?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const role = body.role;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shareId))
      return json(request, { error: "Choose a valid shared map" }, 400);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json(request, { error: "Enter a valid email address" }, 400);
    if (role !== "viewer" && role !== "editor" && role !== "admin")
      return json(request, { error: "Choose a valid sharing role" }, 400);

    const requestHeaders = authenticatedRequest(request, publicKey);
    const shareResponse = await fetch(
      `${supabaseUrl}/rest/v1/project_shares?select=id,name&id=eq.${encodeURIComponent(shareId)}&active=eq.true&limit=1`,
      { headers: requestHeaders },
    );
    if (!shareResponse.ok)
      return json(request, { error: await responseError(shareResponse) }, shareResponse.status);
    const share = ((await shareResponse.json()) as ShareRow[])[0];
    if (!share) return json(request, { error: "This shared map is unavailable" }, 404);

    const memberResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/invite_share_member`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ p_share_id: shareId, p_email: email, p_role: role }),
    });
    if (!memberResponse.ok)
      return json(request, { error: await responseError(memberResponse) }, memberResponse.status);
    const member = ((await memberResponse.json()) as MemberRow[])[0];
    if (!member) return json(request, { error: "Access could not be granted" }, 500);

    const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
    if (!resendApiKey)
      return json(request, {
        member,
        emailSent: false,
        warning: "Access was granted, but outbound invitation email is not configured.",
      });

    const inviteUrl = new URL(Deno.env.get("LANDDRAFT_SITE_URL")?.trim() || DEFAULT_SITE_URL);
    inviteUrl.searchParams.set("share", shareId);
    const sender = inviterName(user);
    const escapedSender = escapeHtml(sender);
    const escapedMap = escapeHtml(share.name);
    const escapedRole = escapeHtml(roleNames[role]);
    const escapedDescription = escapeHtml(roleDescriptions[role]);
    const escapedUrl = escapeHtml(inviteUrl.toString());
    const from = Deno.env.get("RESEND_FROM_EMAIL")?.trim() || DEFAULT_FROM_EMAIL;
    const emailResponse = await fetch(RESEND_EMAILS_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "LandDraft-Share/1.0",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${subjectText(sender)} shared “${subjectText(share.name)}” with you in LandDraft`,
        text: `${sender} invited you to the LandDraft map “${share.name}” with ${roleNames[role]} access.\n\n${roleDescriptions[role]}\n\nOpen the map: ${inviteUrl.toString()}\n\nSign in with this email address to access the shared map.`,
        html: `<!doctype html><html><body style="margin:0;background:#f7f4e8;font-family:Arial,sans-serif;color:#18372b"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #d9ddcf;border-radius:18px;padding:28px"><div style="font-size:22px;font-weight:700;color:#18783f">LandDraft</div><h1 style="font-size:22px;margin:24px 0 8px">A map was shared with you</h1><p style="line-height:1.6"><strong>${escapedSender}</strong> invited you to <strong>${escapedMap}</strong> with ${escapedRole} access.</p><p style="line-height:1.6;color:#52645b">${escapedDescription}</p><p style="margin:28px 0"><a href="${escapedUrl}" style="display:inline-block;background:#18783f;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:12px">Open shared map</a></p><p style="font-size:13px;line-height:1.5;color:#6b776f">Sign in to LandDraft with <strong>${escapeHtml(email)}</strong>. If the button does not work, paste this address into your browser:<br><a href="${escapedUrl}" style="color:#18783f;word-break:break-all">${escapedUrl}</a></p></div></div></body></html>`,
      }),
    });
    if (!emailResponse.ok)
      return json(request, {
        member,
        emailSent: false,
        warning: `Access was granted, but Resend could not deliver the invitation (${emailResponse.status}).`,
      });
    const emailResult = (await emailResponse.json()) as { id?: string };
    return json(request, { member, emailSent: true, messageId: emailResult.id ?? null });
  } catch (error) {
    console.error("Share invitation failed", error);
    return json(
      request,
      { error: error instanceof Error ? error.message : "The invitation could not be sent" },
      500,
    );
  }
});
