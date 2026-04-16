import path from 'node:path';
import { isProtectedPath, DEFAULT_PROTECTED_PATHS } from './protected-paths.js';

export interface PermissionRequest {
  action: string;
  target: string;
}

export interface PermissionOpts {
  root: string;
  writableRoots?: string[];
  allowDelete?: boolean;
  taskId?: string;
  agentId?: string;
}

export interface PermissionResult {
  allowed: boolean;
  escalated: boolean;
  reason: string;
}

function isWithinWritableRoot(
  target: string,
  root: string,
  writableRoots: string[],
): boolean {
  const rel = path.relative(root, path.resolve(root, target));
  // Reject paths that escape root
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return writableRoots.some((wr) => {
    const normalizedWr = wr.replace(/\/+$/, '');
    return rel === normalizedWr || rel.startsWith(normalizedWr + '/');
  });
}

export function evaluatePermission(
  request: PermissionRequest,
  opts?: PermissionOpts,
): PermissionResult {
  const { action, target } = request;
  const resolvedOpts: PermissionOpts = opts ?? { root: process.cwd() };
  const { root, writableRoots, allowDelete } = resolvedOpts;

  if (action === 'read') {
    return { allowed: true, escalated: false, reason: 'read-allowed' };
  }

  if (action === 'write') {
    if (isProtectedPath(root, target, [...DEFAULT_PROTECTED_PATHS])) {
      return {
        allowed: false,
        escalated: true,
        reason: `protected-path: ${target}`,
      };
    }
    if (writableRoots !== undefined && writableRoots.length > 0) {
      if (isWithinWritableRoot(target, root, writableRoots)) {
        return {
          allowed: true,
          escalated: false,
          reason: 'within-writable-root',
        };
      }
      return {
        allowed: false,
        escalated: false,
        reason: `out-of-scope: ${target}`,
      };
    }
    return {
      allowed: false,
      escalated: false,
      reason: 'no-writable-roots-configured',
    };
  }

  if (action === 'delete') {
    if (
      allowDelete === true &&
      !isProtectedPath(root, target, [...DEFAULT_PROTECTED_PATHS]) &&
      writableRoots !== undefined &&
      writableRoots.length > 0 &&
      isWithinWritableRoot(target, root, writableRoots)
    ) {
      return {
        allowed: true,
        escalated: false,
        reason: `delete-allowed: ${target}`,
      };
    }
    return {
      allowed: false,
      escalated: false,
      reason: `delete-denied: ${target}`,
    };
  }

  if (action === 'execute') {
    return {
      allowed: true,
      escalated: false,
      reason: 'execute-delegated-to-command-gate',
    };
  }

  return {
    allowed: false,
    escalated: true,
    reason: `unknown-action: ${action}`,
  };
}

export function createPermissionGate(
  opts: PermissionOpts,
): (request: PermissionRequest) => PermissionResult {
  return (request: PermissionRequest): PermissionResult =>
    evaluatePermission(request, opts);
}
