import { useState } from "react";
import { useWorkbench } from "@/lib/gis/store";

export function WorkspaceLoading() {
  const wb = useWorkbench();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the workspace.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-viewport flex items-center justify-center bg-background p-4 text-sm text-muted-foreground">
      {wb.projectError ? (
        <section className="max-h-[90dvh] w-full max-w-md overflow-auto rounded-2xl border bg-card p-5 text-center shadow-panel">
          <h1 className="font-semibold text-foreground">This cloud project could not open</h1>
          <p className="mt-2 text-sm" role="alert">
            {error ?? wb.projectError}
          </p>
          <button
            disabled={busy}
            onClick={() => window.location.reload()}
            className="mt-4 min-h-11 rounded-xl border px-4 py-2"
          >
            Try again
          </button>
          {wb.projects.length > 0 && (
            <div className="mt-4 text-left">
              <h2 className="font-semibold">Open another project</h2>
              {wb.projects.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => void act(() => wb.openProject(p.id))}
                  className="mt-2 min-h-11 w-full rounded-xl border p-3 text-left text-foreground"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <button
            disabled={busy}
            onClick={() => void act(() => wb.createProject("New workspace"))}
            className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
          >
            Create a separate workspace
          </button>
          <p className="mt-2 text-xs">
            Your existing project and saved-version references will not be deleted or replaced.
          </p>
        </section>
      ) : (
        <p role="status">Opening your latest project…</p>
      )}
    </div>
  );
}

export function WorkspaceRecoveryNotice() {
  const wb = useWorkbench();
  return wb.projectRecoveryNotice ? (
    <div
      role="alert"
      className="relative z-40 border-b border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
    >
      {wb.projectRecoveryNotice}
    </div>
  ) : null;
}
