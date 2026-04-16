import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

// ---------------------------------------------------------------------------
// Dangerous / destructive command patterns
// ---------------------------------------------------------------------------

const GIT_DESTRUCTIVE: RegExp[] = [
  /\bgit\s+push\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\s+\.\s*/,
  /\bgit\s+clean\s+-f/,
  /\bgit\s+merge\b/,
  /\bgit\s+branch\s+-[dD]\b/,
];

const PROTECTED_PATHS: RegExp[] = [
  /\.env\b/,
  /\bsecrets\//,
  /\.github\/workflows\//,
  /\binfra\//,
  /\bdeployment\//,
];

/** Matches `rm` with any combo of -r, -f, -rf, etc. */
const RM_DESTRUCTIVE = /\brm\s+-[a-zA-Z]*[rf]/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `command` matches a dangerous / destructive pattern
 * that should be gated behind explicit user approval.
 */
export function shouldGateCommand(command: string): boolean {
  const trimmed = command.trim();

  // Protected-path access — always gate regardless of verb
  if (PROTECTED_PATHS.some((re) => re.test(trimmed))) {
    return true;
  }

  // Git destructive operations
  if (GIT_DESTRUCTIVE.some((re) => re.test(trimmed))) {
    return true;
  }

  // Destructive rm
  if (RM_DESTRUCTIVE.test(trimmed)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// PI extension entry-point (wiring lives in damage-control.ts)
// ---------------------------------------------------------------------------

export default function (_pi: ExtensionAPI): void {
  // No-op — shouldGateCommand is consumed directly by damage-control.ts
}
