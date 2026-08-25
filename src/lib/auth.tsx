import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Apple, Cloud, KeyRound, LockKeyhole, LogIn, MailCheck, UserPlus } from "lucide-react";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import {
  clearCloudSession,
  cloudAuthRequest,
  cloudConfigured,
  createCloudOAuthUrl,
  getCloudSession,
  readCloudSession,
  refreshCloudSession,
  storeCloudSession,
  type CloudOAuthProvider,
  type CloudSessionPayload,
  type CloudUserRecord,
} from "@/lib/cloud";

export interface AppUser {
  id: string;
  email: string;
  name: string;
}

interface StoredAccount extends AppUser {
  salt: string;
  passwordHash: string;
  createdAt: number;
}

type SignUpResult = "signed-in" | "confirm-email";
const supportedSocialProviders = [
  "google",
  "apple",
] as const satisfies readonly CloudOAuthProvider[];
const defaultCloudSocialProviders = ["google"] as const satisfies readonly CloudOAuthProvider[];

interface CloudAuthSettings {
  external?: Record<string, boolean>;
}

interface AuthApi {
  user: AppUser | null;
  ready: boolean;
  cloudEnabled: boolean;
  socialProviders: readonly CloudOAuthProvider[];
  recoveryMode: boolean;
  signIn(email: string, password: string): Promise<void>;
  signInWithProvider(provider: CloudOAuthProvider): void;
  signUp(name: string, email: string, password: string): Promise<SignUpResult>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

const ACCOUNTS_KEY = "landdraft.accounts.v1";
const SESSION_KEY = "landdraft.session.v1";
const LEGACY_ACCOUNTS_KEY = "terrasketch.accounts.v1";
const LEGACY_SESSION_KEY = "terrasketch.session.v1";
const AuthContext = createContext<AuthApi | null>(null);

const displayName = (user: CloudUserRecord) => {
  const metadataName = user.user_metadata?.["full_name"] ?? user.user_metadata?.["name"];
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] || "LandDraft user";
};

const appUser = (user: CloudUserRecord): AppUser => ({
  id: user.id,
  email: user.email ?? "",
  name: displayName(user),
});

const readAccounts = (): StoredAccount[] => {
  try {
    const current = window.localStorage.getItem(ACCOUNTS_KEY);
    const legacy = window.localStorage.getItem(LEGACY_ACCOUNTS_KEY);
    const accounts = JSON.parse(current ?? legacy ?? "[]") as StoredAccount[];
    if (!current && legacy) window.localStorage.setItem(ACCOUNTS_KEY, legacy);
    return accounts;
  } catch {
    return [];
  }
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const hashPassword = async (password: string, saltHex: string) => {
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [],
  );
  const key = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
};

const validatePassword = (password: string) => {
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [socialProviders, setSocialProviders] = useState<CloudOAuthProvider[]>(() =>
    cloudConfigured ? [...defaultCloudSocialProviders] : [],
  );

  useEffect(() => {
    void (async () => {
      try {
        if (cloudConfigured) {
          try {
            const settings = await cloudAuthRequest<CloudAuthSettings>("/settings");
            setSocialProviders(
              supportedSocialProviders.filter((provider) => settings.external?.[provider]),
            );
          } catch {
            // Keep configured providers available during a temporary settings-endpoint outage.
          }
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const hashAccessToken = hash.get("access_token");
          const hashRefreshToken = hash.get("refresh_token");
          if (hashAccessToken && hashRefreshToken) {
            const currentUser = await cloudAuthRequest<CloudUserRecord>("/user", {
              headers: { Authorization: `Bearer ${hashAccessToken}` },
            });
            storeCloudSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken,
              expires_in: Number(hash.get("expires_in") ?? 3600),
              token_type: hash.get("token_type") ?? "bearer",
              user: currentUser,
            });
            setRecoveryMode(hash.get("type") === "recovery");
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          const session = await getCloudSession().catch(() => null);
          if (session) {
            const currentUser = await cloudAuthRequest<CloudUserRecord>("/user", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            storeCloudSession({ ...session, user: currentUser });
            setUser(appUser(currentUser));
          }
        } else {
          const currentSession = window.localStorage.getItem(SESSION_KEY);
          const legacySession = window.localStorage.getItem(LEGACY_SESSION_KEY);
          const userId = currentSession ?? legacySession;
          if (!currentSession && legacySession)
            window.localStorage.setItem(SESSION_KEY, legacySession);
          const account = readAccounts().find((item) => item.id === userId);
          if (account) setUser({ id: account.id, email: account.email, name: account.name });
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!cloudConfigured || !user) return;
    const timer = window.setInterval(
      () => void refreshCloudSession().catch(() => setUser(null)),
      45 * 60_000,
    );
    return () => window.clearInterval(timer);
  }, [user]);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      ready,
      cloudEnabled: cloudConfigured,
      socialProviders,
      recoveryMode,
      async signIn(rawEmail, password) {
        const email = rawEmail.trim().toLowerCase();
        if (cloudConfigured) {
          const session = await cloudAuthRequest<CloudSessionPayload>(
            "/token?grant_type=password",
            { method: "POST", body: JSON.stringify({ email, password }) },
          );
          storeCloudSession(session);
          setUser(appUser(session.user));
          return;
        }
        const account = readAccounts().find((item) => item.email === email);
        if (!account || (await hashPassword(password, account.salt)) !== account.passwordHash)
          throw new Error("Email or password is incorrect");
        window.localStorage.setItem(SESSION_KEY, account.id);
        setUser({ id: account.id, email: account.email, name: account.name });
      },
      signInWithProvider(provider) {
        if (!cloudConfigured)
          throw new Error("Social sign-in becomes available when cloud accounts are connected");
        window.location.assign(createCloudOAuthUrl(provider, window.location.origin));
      },
      async signUp(rawName, rawEmail, password) {
        const name = rawName.trim();
        const email = rawEmail.trim().toLowerCase();
        if (!name) throw new Error("Enter your name");
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
        validatePassword(password);
        if (cloudConfigured) {
          const response = await cloudAuthRequest<
            Partial<CloudSessionPayload> & { user: CloudUserRecord }
          >("/signup", {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
              data: { full_name: name },
              email_redirect_to: window.location.origin,
            }),
          });
          if (response.access_token && response.refresh_token) {
            const session = response as CloudSessionPayload;
            storeCloudSession(session);
            setUser(appUser(session.user));
            return "signed-in";
          }
          return "confirm-email";
        }
        const accounts = readAccounts();
        if (accounts.some((item) => item.email === email))
          throw new Error("An account already exists for this email");
        const salt = bytesToHex(window.crypto.getRandomValues(new Uint8Array(16)));
        const account: StoredAccount = {
          id: window.crypto.randomUUID(),
          email,
          name,
          salt,
          passwordHash: await hashPassword(password, salt),
          createdAt: Date.now(),
        };
        window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
        window.localStorage.setItem(SESSION_KEY, account.id);
        setUser({ id: account.id, email, name });
        return "signed-in";
      },
      async requestPasswordReset(rawEmail) {
        if (!cloudConfigured)
          throw new Error("Password reset becomes available when cloud accounts are connected");
        const email = rawEmail.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter your email address first");
        await cloudAuthRequest("/recover", {
          method: "POST",
          body: JSON.stringify({ email, redirect_to: window.location.origin }),
        });
      },
      async updatePassword(password) {
        validatePassword(password);
        const session = await getCloudSession();
        const currentUser = await cloudAuthRequest<CloudUserRecord>("/user", {
          method: "PUT",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ password }),
        });
        storeCloudSession({ ...session, user: currentUser });
        setRecoveryMode(false);
        setUser(appUser(currentUser));
      },
      async signOut() {
        if (cloudConfigured) {
          const session = readCloudSession();
          if (session)
            await cloudAuthRequest("/logout", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
            }).catch(() => undefined);
          clearCloudSession();
        } else {
          window.localStorage.removeItem(SESSION_KEY);
          window.localStorage.removeItem(LEGACY_SESSION_KEY);
        }
        setUser(null);
      },
    }),
    [ready, recoveryMode, socialProviders, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (!auth.ready)
    return (
      <div className="app-scroll-viewport flex items-center justify-center bg-background text-sm text-muted-foreground">
        Opening your workspace…
      </div>
    );
  if (auth.recoveryMode) return <RecoveryScreen />;
  return auth.user ? children : <LoginScreen />;
}

function RecoveryScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <AuthCard title="Choose a new password" subtitle="Secure your LandDraft account">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void auth
            .updatePassword(password)
            .catch((caught) => setError(caught instanceof Error ? caught.message : "Reset failed"))
            .finally(() => setBusy(false));
        }}
      >
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="New password (10+ characters)"
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <SubmitButton busy={busy} label="Update password" icon={<KeyRound className="size-4" />} />
      </form>
    </AuthCard>
  );
}

function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState<CloudOAuthProvider | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const result = await auth.signUp(name, email, password);
        if (result === "confirm-email") {
          setMessage("Check your email to confirm the account, then sign in on any device.");
          setMode("login");
        }
      } else await auth.signIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await auth.requestPasswordReset(email);
      setMessage("Password reset email sent. Follow its secure link to choose a new password.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const useProvider = (provider: CloudOAuthProvider) => {
    setError("");
    setMessage("");
    setProviderBusy(provider);
    try {
      auth.signInWithProvider(provider);
    } catch (caught) {
      setProviderBusy(null);
      setError(caught instanceof Error ? caught.message : "Social sign-in failed");
    }
  };

  return (
    <AuthCard
      title="LandDraft"
      subtitle={
        auth.cloudEnabled ? "Your maps, synced securely across devices" : "Your maps and projects"
      }
    >
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-secondary p-1 text-xs font-semibold">
        {(["login", "signup"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setMode(item)}
            className={`rounded-lg py-2 ${mode === item ? "bg-card shadow-panel" : ""}`}
          >
            {item === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      {auth.socialProviders.length > 0 && (
        <>
          <div
            className={`grid gap-2 ${auth.socialProviders.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
          >
            {auth.socialProviders.includes("google") && (
              <OAuthButton
                provider="google"
                label="Google"
                busy={providerBusy === "google"}
                disabled={busy || providerBusy !== null}
                icon={<GoogleMark />}
                onClick={useProvider}
              />
            )}
            {auth.socialProviders.includes("apple") && (
              <OAuthButton
                provider="apple"
                label="Apple"
                busy={providerBusy === "apple"}
                disabled={busy || providerBusy !== null}
                icon={<Apple className="size-4 fill-current" />}
                onClick={useProvider}
              />
            )}
          </div>
          <div className="my-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        {mode === "signup" && (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        )}
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          type="email"
          autoComplete="email"
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder={mode === "signup" ? "Password (10+ characters)" : "Password"}
          current={mode === "login"}
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {message && (
          <p className="flex gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
            <MailCheck className="mt-0.5 size-4 shrink-0" /> {message}
          </p>
        )}
        <SubmitButton
          busy={busy}
          label={mode === "login" ? "Sign in" : "Create account"}
          icon={mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
        />
      </form>
      {mode === "login" && auth.cloudEnabled && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void sendReset()}
          className="mt-3 w-full text-center text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          Forgot password?
        </button>
      )}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-muted-foreground">
        {auth.cloudEnabled ? (
          <>
            <Cloud className="size-3.5" /> Projects and restore points sync to your private cloud
            workspace.
          </>
        ) : (
          "Cloud connection pending; this build keeps its existing device-only workspace."
        )}
      </p>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
        By continuing, you agree to the{" "}
        <a className="font-medium text-primary hover:underline" href="/terms">
          Terms
        </a>{" "}
        and acknowledge the{" "}
        <a className="font-medium text-primary hover:underline" href="/privacy">
          Privacy Policy
        </a>
        .
      </p>
    </AuthCard>
  );
}

function OAuthButton({
  provider,
  label,
  busy,
  disabled,
  icon,
  onClick,
}: {
  provider: CloudOAuthProvider;
  label: string;
  busy: boolean;
  disabled: boolean;
  icon: ReactNode;
  onClick: (provider: CloudOAuthProvider) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(provider)}
      aria-label={`Continue with ${label}`}
      className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary/50 disabled:opacity-50"
    >
      {icon}
      {busy ? "Opening…" : label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.61Z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.61C7.18 7.76 9.39 6 12 6Z"
      />
    </svg>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="app-scroll-viewport flex items-center justify-center bg-[radial-gradient(circle_at_top,#e4efdc,transparent_55%)] px-4">
      <section className="panel-surface w-full max-w-sm rounded-3xl p-6 shadow-float">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <LandDraftMark className="size-7" />
          </span>
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  current = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  current?: boolean;
}) {
  return (
    <div className="relative">
      <LockKeyhole className="absolute left-3 top-3 size-4 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="password"
        autoComplete={current ? "current-password" : "new-password"}
        className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{children}</p>
  );
}

function SubmitButton({ busy, label, icon }: { busy: boolean; label: string; icon: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
    >
      {icon}
      {busy ? "Please wait…" : label}
    </button>
  );
}
