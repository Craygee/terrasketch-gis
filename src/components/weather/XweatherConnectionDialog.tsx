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
  type XweatherConnectionStatus,
} from "@/lib/weather/xweatherConnection";

const XWEATHER_SIGNUP_URL =
  "https://www.xweather.com/signup/checkout?items=payg::monthly:v1&source=api-pricing-hero";
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

  useEffect(() => {
    if (!open) return;
    setEditing(!status.connected);
    setError(null);
    setApiKey("");
  }, [open, status.connected]);

  const connect = async () => {
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
        description: "Premium weather usage now belongs to this Xweather account.",
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xweather did not connect");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Xweather for your LandDraft account?")) return;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,46rem)] max-w-xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <KeyRound className="size-4" />
            </span>
            Connect your Xweather account
          </DialogTitle>
          <DialogDescription>
            Use your own Xweather allowance for optional premium products. This does not connect
            your password or give LandDraft access to your Xweather account profile.
          </DialogDescription>
        </DialogHeader>

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
            </div>
            <div className="flex flex-wrap gap-2">
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
                <strong>1.</strong> Choose <strong>Xweather Weather API — Pay As You Go</strong>.
                LandDraft uses its <strong>Raster Maps</strong> products.
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
                Create free Weather API account <ExternalLink className="size-3.5" />
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

            {error && (
              <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</p>
            )}
          </div>
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
              disabled={busy}
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
