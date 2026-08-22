import { cn } from "@/lib/utils";

export function LandDraftMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="LandDraft parcel mark"
      className={cn("size-5", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.25 23.75 8.5 7.5 20.75 4.5l5.5 7.25-2.5 13-12.5 2.75-5-3.75Z"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 7.5 7.25 6.25 10.5-2M15.75 13.75l-4.5 13.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15.75" cy="13.75" r="2.15" fill="currentColor" />
    </svg>
  );
}
