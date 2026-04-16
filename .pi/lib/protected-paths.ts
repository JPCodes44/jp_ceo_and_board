import path from 'node:path';

export const DEFAULT_PROTECTED_PATHS: readonly string[] = [
  '.github/workflows/',
  'infra/',
  'deployment/',
  '.env',
  'secrets/',
  'package-lock.json',
  '.pi/extensions/',
] as const;

export function normalizeProtectedPaths(root: string, paths: readonly string[]): string[] {
  return paths.map((p) => path.resolve(root, p));
}

export function isProtectedPath(
  rootOrTarget: string,
  target?: string,
  protectedPaths?: readonly string[],
): boolean {
  // Support single-argument shorthand: isProtectedPath(target)
  const root = target !== undefined ? rootOrTarget : process.cwd();
  const resolvedTarget = target !== undefined ? target : rootOrTarget;
  const resolvedPaths = protectedPaths ?? [...DEFAULT_PROTECTED_PATHS];

  const absTarget = path.resolve(root, resolvedTarget);
  const normalized = normalizeProtectedPaths(root, [...resolvedPaths]);

  for (const pp of normalized) {
    if (absTarget === pp) return true;
    // Directory check: protected path ends with separator → treat as directory prefix
    if (pp.endsWith(path.sep) && absTarget.startsWith(pp)) return true;
    // Also handle directories specified with trailing '/' that got resolved (separator stripped)
    // Check if target is a child by ensuring separator follows the prefix
    if (!pp.endsWith(path.sep) && absTarget.startsWith(pp + path.sep)) return true;
  }

  // Catch parent-traversal attempts that escape root but reference a protected filename.
  // For file-type entries (no trailing slash), match by basename anywhere.
  const targetBase = path.basename(absTarget);
  for (const raw of resolvedPaths) {
    if (raw.endsWith('/')) continue; // skip directory patterns
    if (targetBase === path.basename(raw)) return true;
  }

  return false;
}
