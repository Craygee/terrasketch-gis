import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LockKeyhole, LogIn, Mountain, UserPlus } from "lucide-react";

export interface LocalUser {
  id: string;
  email: string;
  name: string;
}

interface StoredAccount extends LocalUser {
  salt: string;
  passwordHash: string;
  createdAt: number;
}

interface AuthApi {
  user: LocalUser | null;
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): void;
}

const ACCOUNTS_KEY = "terrasketch.accounts.v1";
const SESSION_KEY = "terrasketch.session.v1";
const AuthContext = createContext<AuthApi | null>(null);

const readAccounts = (): StoredAccount[] => {
  try {
    return JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as StoredAccount[];
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const userId = window.localStorage.getItem(SESSION_KEY);
      const account = readAccounts().find((item) => item.id === userId);
      if (account) setUser({ id: account.id, email: account.email, name: account.name });
    } finally {
      setReady(true);
    }
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      ready,
      async signIn(rawEmail, password) {
        const email = rawEmail.trim().toLowerCase();
        const account = readAccounts().find((item) => item.email === email);
        if (!account || (await hashPassword(password, account.salt)) !== account.passwordHash)
          throw new Error("Email or password is incorrect");
        const next = { id: account.id, email: account.email, name: account.name };
        window.localStorage.setItem(SESSION_KEY, account.id);
        setUser(next);
      },
      async signUp(rawName, rawEmail, password) {
        const name = rawName.trim();
        const email = rawEmail.trim().toLowerCase();
        if (!name) throw new Error("Enter your name");
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
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
      },
      signOut() {
        window.localStorage.removeItem(SESSION_KEY);
        setUser(null);
      },
    }),
    [ready, user],
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
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Opening your workspace…
      </div>
    );
  return auth.user ? children : <LoginScreen />;
}

function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") await auth.signUp(name, email, password);
      else await auth.signIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#e4efdc,transparent_55%)] px-4">
      <section className="panel-surface w-full max-w-sm rounded-3xl p-6 shadow-float">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Mountain className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold">TerraSketch GIS</h1>
            <p className="text-xs text-muted-foreground">Your maps, projects and save history</p>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-secondary p-1 text-xs font-semibold">
          <button
            onClick={() => setMode("login")}
            className={`rounded-lg py-2 ${mode === "login" ? "bg-card shadow-panel" : ""}`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`rounded-lg py-2 ${mode === "signup" ? "bg-card shadow-panel" : ""}`}
          >
            Create account
          </button>
        </div>
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
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
          Accounts are password-protected and projects stay on this browser/device in this release.
        </p>
      </section>
    </main>
  );
}
