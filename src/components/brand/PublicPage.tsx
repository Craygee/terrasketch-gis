import type { ReactNode } from "react";

import { LandDraftMark } from "@/components/brand/LandDraftMark";

type PublicPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

export function PublicPage({ eyebrow, title, intro, children }: PublicPageProps) {
  return (
    <div className="min-h-dvh bg-[#f7f4e9] text-[#173328]">
      <header className="border-b border-[#d9d5c5] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="/about" className="flex items-center gap-3" aria-label="LandDraft home">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#227448] text-[#fff9e9]">
              <LandDraftMark className="size-6" />
            </span>
            <span>
              <span className="block text-lg font-bold leading-none">LandDraft</span>
              <span className="mt-1 block text-xs text-[#5d6d65]">
                Friendly maps. Real GIS power.
              </span>
            </span>
          </a>
          <a
            href="/"
            className="rounded-full bg-[#227448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#195c39]"
          >
            Open the map
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#227448]">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-lg leading-8 text-[#52635b]">{intro}</p>
        </div>
        <div className="public-copy mt-12 max-w-3xl">{children}</div>
      </main>

      <footer className="border-t border-[#d9d5c5] bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-6 text-sm text-[#5d6d65] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 LandDraft</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal and product links">
            <a className="hover:text-[#227448]" href="/about">
              About
            </a>
            <a className="hover:text-[#227448]" href="/privacy">
              Privacy
            </a>
            <a className="hover:text-[#227448]" href="/terms">
              Terms
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PublicSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
