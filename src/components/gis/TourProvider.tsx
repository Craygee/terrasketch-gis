import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";

import { TOUR_REGISTRY, TOUR_VERSION, type TourKind } from "@/lib/gis/tours";
import { useMapRef } from "@/lib/gis/mapRef";
import { cn } from "@/lib/utils";

interface OnboardingPreference {
  version: number;
  seen: boolean;
  featureTips: boolean;
}

interface TourApi {
  startTour: (kind: TourKind) => void;
  featureTips: boolean;
  setFeatureTips: (enabled: boolean) => void;
}

const STORAGE_KEY = "landdraft:onboarding";
const TourContext = createContext<TourApi | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const { setPrintOpen } = useMapRef();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [featureTips, setFeatureTipsState] = useState(true);
  const [activeTour, setActiveTour] = useState<TourKind | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const savePreference = useCallback((patch: Partial<OnboardingPreference>) => {
    const current = readPreference();
    const next: OnboardingPreference = {
      ...(current ?? { version: TOUR_VERSION, seen: true, featureTips: true }),
      seen: true,
      featureTips: true,
      ...patch,
      version: patch.version ?? TOUR_VERSION,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    const stored = readPreference();
    if (!stored?.seen) {
      setWelcomeOpen(true);
      return;
    }
    setFeatureTipsState(stored.featureTips);
    if (stored.featureTips && stored.version < TOUR_VERSION) setWelcomeOpen(true);
  }, []);

  const startTour = useCallback(
    (kind: TourKind) => {
      setWelcomeOpen(false);
      setStepIndex(0);
      savePreference({ seen: true, featureTips, version: TOUR_VERSION });
      if (kind === "print") {
        setPrintOpen(true);
        window.setTimeout(() => setActiveTour(kind), 260);
      } else {
        setActiveTour(kind);
      }
    },
    [featureTips, savePreference, setPrintOpen],
  );

  const setFeatureTips = useCallback(
    (enabled: boolean) => {
      setFeatureTipsState(enabled);
      savePreference({ featureTips: enabled });
    },
    [savePreference],
  );

  const value = useMemo(
    () => ({ startTour, featureTips, setFeatureTips }),
    [startTour, featureTips, setFeatureTips],
  );

  const skipWelcome = () => {
    setWelcomeOpen(false);
    setFeatureTipsState(false);
    savePreference({ seen: true, featureTips: false });
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {welcomeOpen && (
        <WelcomeTour
          isUpdate={Boolean(readPreference()?.seen)}
          onStart={() => {
            setFeatureTipsState(true);
            savePreference({ seen: true, featureTips: true });
            startTour("basic");
          }}
          onSkip={skipWelcome}
        />
      )}
      {activeTour && (
        <GuidedTour
          key={`${activeTour}-${stepIndex}`}
          kind={activeTour}
          stepIndex={stepIndex}
          onStep={setStepIndex}
          onClose={() => setActiveTour(null)}
          onContinueAdvanced={() => {
            setStepIndex(0);
            setActiveTour("advanced");
          }}
          onContinuePrint={() => {
            setStepIndex(0);
            setPrintOpen(true);
            window.setTimeout(() => setActiveTour("print"), 220);
          }}
        />
      )}
    </TourContext.Provider>
  );
}

// Shared with the desktop and mobile help menus.
// eslint-disable-next-line react-refresh/only-export-components
export function useTours(): TourApi {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTours must be used inside TourProvider");
  return value;
}

function WelcomeTour({
  isUpdate,
  onStart,
  onSkip,
}: {
  isUpdate: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="app-overlay-viewport fixed inset-0 z-[260] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-welcome-title"
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl"
      >
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Sparkles className="size-6" />
        </span>
        <h1 id="tour-welcome-title" className="text-xl font-bold">
          {isUpdate ? "See what’s new in LandDraft" : "Welcome to LandDraft"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Take a short guided tour directly on the map. It covers layers, drawing, public data,
          spatial analysis, print maps—and where to ask the AI for help.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onStart}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Start quick tour <ChevronRight className="size-4" />
          </button>
          <button
            onClick={onSkip}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent"
          >
            Skip for now
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          You can replay either walkthrough—or turn future tour prompts back on—any time from the
          <strong className="font-semibold text-foreground"> i</strong> menu.
        </p>
      </section>
    </div>
  );
}

function GuidedTour({
  kind,
  stepIndex,
  onStep,
  onClose,
  onContinueAdvanced,
  onContinuePrint,
}: {
  kind: TourKind;
  stepIndex: number;
  onStep: (index: number) => void;
  onClose: () => void;
  onContinueAdvanced: () => void;
  onContinuePrint: () => void;
}) {
  const steps = TOUR_REGISTRY[kind];
  const step = steps[stepIndex]!;
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let attempts = 0;
    let timer = 0;
    const locate = () => {
      const node = findTourTarget(step.target);
      if (node) {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
        setTargetRect(node.getBoundingClientRect());
        return;
      }
      attempts += 1;
      if (attempts < 10) timer = window.setTimeout(locate, 90);
      else if (stepIndex < steps.length - 1) onStep(stepIndex + 1);
      else onClose();
    };
    locate();
    const refresh = () => {
      const node = findTourTarget(step.target);
      if (node) setTargetRect(node.getBoundingClientRect());
    };
    window.addEventListener("resize", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", refresh);
    };
  }, [onClose, onStep, step.target, stepIndex, steps.length]);

  if (!targetRect) return null;
  const pad = 7;
  const top = Math.max(4, targetRect.top - pad);
  const left = Math.max(4, targetRect.left - pad);
  const width = Math.min(window.innerWidth - left - 4, targetRect.width + pad * 2);
  const height = Math.min(window.innerHeight - top - 4, targetRect.height + pad * 2);
  const placeBelow = targetRect.bottom + 250 < window.innerHeight || targetRect.top < 260;
  const tipWidth = Math.min(360, window.innerWidth - 24);
  const tipLeft = Math.max(
    12,
    Math.min(
      window.innerWidth - tipWidth - 12,
      targetRect.left + targetRect.width / 2 - tipWidth / 2,
    ),
  );
  const tipTop = placeBelow
    ? Math.min(window.innerHeight - 220, targetRect.bottom + 18)
    : Math.max(12, targetRect.top - 218);
  const finalStep = stepIndex === steps.length - 1;

  return (
    <div
      className="app-overlay-viewport pointer-events-none fixed inset-0 z-[210]"
      aria-live="polite"
    >
      <div
        className="fixed rounded-2xl ring-4 ring-amber-300/90 transition-all duration-200"
        style={{
          top,
          left,
          width,
          height,
          boxShadow: "0 0 0 9999px rgb(15 23 42 / 0.62)",
        }}
      />
      <section
        role="dialog"
        aria-label={`${kind} walkthrough`}
        className="pointer-events-auto fixed rounded-2xl border border-border bg-card p-4 shadow-2xl"
        style={{ top: tipTop, left: tipLeft, width: tipWidth }}
      >
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 text-amber-300",
            placeBelow ? "-top-4" : "-bottom-4",
          )}
        >
          {placeBelow ? <ArrowUp className="size-6" /> : <ArrowDown className="size-6" />}
        </span>
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground hover:bg-accent"
          aria-label="Close tour"
        >
          <X className="size-4" />
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          {kind === "basic"
            ? "Quick tour"
            : kind === "advanced"
              ? "Advanced tour"
              : "Print map tour"}{" "}
          · {stepIndex + 1}/{steps.length}
        </p>
        <h2 className="mt-1 pr-6 text-base font-bold">{step.title}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {stepIndex > 0 && (
            <button
              onClick={() => onStep(stepIndex - 1)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium hover:bg-accent"
            >
              <ChevronLeft className="size-3.5" /> Back
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            End tour
          </button>
          <div className="ml-auto flex gap-2">
            {!finalStep && (
              <button
                onClick={() => onStep(stepIndex + 1)}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            )}
            {finalStep && kind === "basic" && (
              <>
                <button
                  onClick={onClose}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  <Check className="size-3.5" /> Finish
                </button>
                <button
                  onClick={onContinueAdvanced}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Continue to advanced
                </button>
              </>
            )}
            {finalStep && kind === "advanced" && (
              <>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  Done
                </button>
                <button
                  onClick={onContinuePrint}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Tour Print map
                </button>
              </>
            )}
            {finalStep && kind === "print" && (
              <button
                onClick={onClose}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                <Check className="size-3.5" /> Finish
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function readPreference(): OnboardingPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as OnboardingPreference) : null;
  } catch {
    return null;
  }
}

function findTourTarget(target: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return (
    nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ?? null
  );
}
