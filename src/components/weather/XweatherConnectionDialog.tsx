import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2Off,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  connectXweather,
  disconnectXweather,
  testXweatherConnection,
  type XweatherConnectionStatus,
} from "@/lib/weather/xweatherConnection";

const XWEATHER_SIGNUP_URL = "https://new.xweather.com/legal";
const XWEATHER_DASHBOARD_URL = "https://data.portal.xweather.com/account/";

export function XweatherConnectionDialog({
  open,
  status,
  onOpenChange,
  onStatus,
}: {
  open: boolean;
  status: XweatherConnectionStatus;
  onOpenChange: (open: boolean) => void;
  onStatus: (status: XweatherConnectionStatus) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(!status.connected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const connectionBlock =
    status.state === "loading"
      ? "Checking connection configuration…"
      : status.state === "server-not-configured"
        ? "Secure provider connections are not configured for this deployment. An administrator must configure server-side credential encryption before connecting."
        : !status.approvedProducts?.length
          ? "LICENSE REVIEW REQUIRED. An administrator must record an active product-specific license approval before credentials can be submitted."
          : null;

  useEffect(() => {
    if (!open) return;
    setEditing(!status.connected);
    setError(null);
    setApiKey("");
  }, [open, status.connected]);

  const connect = async () => {
    if (connectionBlock) {
      setError(connectionBlock);
      return;
    }
    if (!apiKey.trim()) {
      setError("Enter the API key from your Xweather dashboard.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await connectXweather(apiKey);
      onStatus(next);
      setApiKey("");
      setEditing(false);
      toast.success("Xweather connected", {
        description: "The tested product is available under your account's reviewed access.",
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xweather did not connect");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await disconnectXweather();
      onStatus(next);
      setEditing(true);
      toast.success("Xweather disconnected");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xweather did not disconnect");
    } finally {
      setBusy(false);
    }
  };

  const testSaved = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await testXweatherConnection(product || undefined);
      onStatus({ ...status, ...next });
      if (next.error) setError(next.error);
      else toast.success("Product access verified");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Connection test failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,46rem)] max-w-xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <KeyRound className="size-4" />
            </span>
            Data Sources · Xweather
          </DialogTitle>
          <DialogDescription>
            Use an account whose subscription and license permit LandDraft integration. Credentials
            alone do not establish rights to a product.
          </DialogDescription>
        </DialogHeader>
        {connectionBlock && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
            {connectionBlock}
          </p>
        )}

        {status.connected && !editing ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4" /> Connected
              </div>
              <p className="mt-1 text-xs">API key {status.clientIdHint ?? "saved securely"}</p>
              {status.lastTestedAt && (
                <p className="mt-1 text-[10px] opacity-75">
                  Tested {new Date(status.lastTestedAt).toLocaleString()}
                </p>
              )}
              {status.error && <p className="mt-2 text-xs">{status.error}</p>}
              <p className="mt-2 text-xs">
                Entitlements:{" "}
                {status.verifiedProducts?.length
                  ? status.verifiedProducts.join(", ")
                  : "Not yet verified in this session"}
              </p>
              {status.lastSuccessfulRequest && (
                <p className="mt-1 text-xs">
                  Last successful request: {new Date(status.lastSuccessfulRequest).toLocaleString()}
                </p>
              )}
            </div>
            <label className="block text-xs">
              Product to test
              <select
                value={product}
                onChange={(event) => setProduct(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3"
              >
                <option value="">Select an approved product</option>
                {(status.approvedProducts ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !status.approvedProducts?.length}
                onClick={() => void testSaved()}
                className="rounded-xl bg-secondary px-3 py-3 text-xs font-semibold disabled:opacity-50"
              >
                Test connection
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                Replace credentials
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disconnect()}
                className="flex items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Link2Off className="size-3.5" /> Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-2 rounded-2xl bg-secondary p-4 text-xs leading-relaxed">
              <li>
                <strong>1.</strong> Confirm that your agreement permits the intended LandDraft use.
                An active, product-specific license approval is required before connecting.
              </li>
              <li>
                <strong>2.</strong> In the left menu, select <strong>API Keys</strong>. Copy the key
                shown, or choose <strong>Manage your API keys</strong> to create a dedicated key
                named <strong>LandDraft</strong>.
              </li>
              <li>
                <strong>3.</strong> Paste the complete API key below. LandDraft securely separates
                its client ID and secret for Xweather requests.
              </li>
            </ol>

            <div className="flex flex-wrap gap-2">
              <a
                href={XWEATHER_SIGNUP_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Terms and licensing <ExternalLink className="size-3.5" />
              </a>
              <a
                href={XWEATHER_DASHBOARD_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                Sign in to Weather API <ExternalLink className="size-3.5" />
              </a>
            </div>

            <div className="space-y-2">
              <Label htmlFor="xweather-api-key">Xweather API key</Label>
              <Input
                id="xweather-api-key"
                type="password"
                disabled={busy || !!connectionBlock}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                placeholder="Paste the complete API key"
              />
              <p className="text-[10px] text-muted-foreground">
                The key normally contains an underscore separating the client ID and secret.
              </p>
            </div>

            <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-950">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              LandDraft encrypts these credentials server-side. Xweather usage limits and any
              charges remain associated with your Xweather account. Some products consume multiple
              accesses per request.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          {status.connected && editing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-accent"
            >
              Cancel
            </button>
          )}
          {editing && (
            <button
              type="button"
              disabled={busy || !!connectionBlock}
              onClick={() => void connect()}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Test and connect
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
