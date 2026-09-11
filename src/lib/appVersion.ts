declare const __LANDDRAFT_APP_VERSION__: string;
declare const __LANDDRAFT_APP_CHANNEL__: "release" | "test";
declare const __LANDDRAFT_APP_REVISION__: string;

export const LANDDRAFT_APP_VERSION = __LANDDRAFT_APP_VERSION__;
export const LANDDRAFT_APP_CHANNEL = __LANDDRAFT_APP_CHANNEL__;
export const LANDDRAFT_APP_REVISION = __LANDDRAFT_APP_REVISION__;

export const LANDDRAFT_APP_VERSION_SHORT = LANDDRAFT_APP_VERSION.split("+")[0];

const twoDigits = (value: number) => String(value).padStart(2, "0");

/**
 * Permanent, timezone-independent label for a saved project snapshot.
 * The database timestamp is already persisted for local and cloud saves, so old projects gain
 * useful version labels without a migration or a fragile list position.
 */
export function projectVersionLabel(savedAt: number) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "PV-unknown";
  return `PV-${date.getUTCFullYear()}${twoDigits(date.getUTCMonth() + 1)}${twoDigits(date.getUTCDate())}-${twoDigits(date.getUTCHours())}${twoDigits(date.getUTCMinutes())}${twoDigits(date.getUTCSeconds())}Z`;
}
