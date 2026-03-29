import fs from "node:fs";
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

function normalizeCase(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function normalizeAbsolute(root: string, candidate: string): string {
  const absolute = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(root, candidate);

  return normalizeCase(path.normalize(absolute));
}

function tryRealpath(p: string): string {
  try {
    return normalizeCase(fs.realpathSync.native(p));
  } catch {
    // Fall back for non-existent paths
    return normalizeCase(path.normalize(p));
  }
}

export function normalizeProtectedPaths(
  root: string,
  protectedPaths: readonly ProtectedPath[] = DEFAULT_PROTECTED_PATHS,
): string[] {
  const normalizedRoot = tryRealpath(path.resolve(root));
  return protectedPaths.map((entry) =>
    tryRealpath(path.isAbsolute(entry) ? entry : path.resolve(normalizedRoot, entry)),
  );
}

export function isProtectedPath(
  root: string,
  candidate: string,
  protectedPaths: readonly ProtectedPath[] = DEFAULT_PROTECTED_PATHS,
): boolean {
  const normalizedRoot = tryRealpath(path.resolve(root));

  const lexicalTarget = normalizeAbsolute(normalizedRoot, candidate);
  const realTarget = tryRealpath(lexicalTarget);

  const normalizedProtected = normalizeProtectedPaths(normalizedRoot, protectedPaths);

  return normalizedProtected.some((protectedPath) => {
    return (
      lexicalTarget === protectedPath ||
      lexicalTarget.startsWith(protectedPath + path.sep) ||
      realTarget === protectedPath ||
      realTarget.startsWith(protectedPath + path.sep)
    );
  });
}