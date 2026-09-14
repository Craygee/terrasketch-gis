export function isMissingSnapshot(error: unknown) {
  const e = error as { status?: number; message?: string };
  return (
    e?.status === 404 ||
    (e?.status === 400 && /^(object not found|not found)$/i.test(e.message ?? ""))
  );
}

export async function recoverSnapshot<T>(
  currentPath: string,
  versions: { storagePath?: string; savedAt: number }[],
  download: (path: string) => Promise<T>,
) {
  try {
    return { state: await download(currentPath), recoveredAt: null as number | null };
  } catch (error) {
    if (!isMissingSnapshot(error)) throw error;
  }
  const tried = new Set([currentPath]);
  for (const version of [...versions].sort((a, b) => b.savedAt - a.savedAt)) {
    if (!version.storagePath || tried.has(version.storagePath)) continue;
    tried.add(version.storagePath);
    try {
      return { state: await download(version.storagePath), recoveredAt: version.savedAt };
    } catch (error) {
      if (!isMissingSnapshot(error)) throw error;
    }
  }
  throw new Error(
    "This project's saved files are unavailable in cloud storage. Its project entry has been preserved. Open another project or create a new workspace while the missing files are restored.",
  );
}
