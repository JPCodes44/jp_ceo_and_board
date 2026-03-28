import path from "node:path";

export const DEFAULT_PROTECTED_PATHS = [
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  ".pi/SYSTEM.md",
  ".pi/APPEND_SYSTEM.md",
  ".pi/extensions",
] as const;

export type ProtectedPath = (typeof DEFAULT_PROTECTED_PATHS)[number] | string;

function normalizeAbsolute(root: string, candidate: string): string {
  const absolute = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(root, candidate);

  return path.normalize(absolute);
}

export function normalizeProtectedPaths(
  root: string,
  protectedPaths: readonly ProtectedPath[] = DEFAULT_PROTECTED_PATHS,
): string[] {
  return protectedPaths.map((entry) => normalizeAbsolute(root, entry));
}

export function isProtectedPath(
  root: string,
  candidate: string,
  protectedPaths: readonly ProtectedPath[] = DEFAULT_PROTECTED_PATHS,
): boolean {
  const target = normalizeAbsolute(root, candidate);

  return normalizeProtectedPaths(root, protectedPaths).some((protectedPath) => {
    if (target === protectedPath) {
      return true;
    }

    return target.startsWith(`${protectedPath}${path.sep}`);
  });
}
