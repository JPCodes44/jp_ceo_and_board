import path from "node:path";

import {
  DEFAULT_PROTECTED_PATHS,
  type ProtectedPath,
  isProtectedPath,
} from "./protected-paths.ts";

export type PermissionAction = "read" | "write" | "delete" | "execute";

export interface PermissionRequest {
  action: PermissionAction;
  target: string;
  reason?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  escalated: boolean;
  reason: string;
}

export interface PermissionGateOptions {
  root: string;
  protectedPaths?: readonly ProtectedPath[];
  writableRoots?: readonly string[];
  allowDelete?: boolean;
}

function normalizeAbsolute(root: string, candidate: string): string {
  const absolute = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(root, candidate);

  return path.normalize(absolute);
}

function isInsideAllowedRoots(
  target: string,
  allowedRoots: readonly string[],
  root: string,
): boolean {
  return allowedRoots
    .map((entry) => normalizeAbsolute(root, entry))
    .some((allowedRoot) => {
      if (target === allowedRoot) {
        return true;
      }

      return target.startsWith(`${allowedRoot}${path.sep}`);
    });
}

export function evaluatePermission(
  request: PermissionRequest,
  options: PermissionGateOptions,
): PermissionDecision {
  const protectedPaths = options.protectedPaths ?? DEFAULT_PROTECTED_PATHS;
  const writableRoots = options.writableRoots ?? [options.root];
  const target = normalizeAbsolute(options.root, request.target);

  if (request.action === "read") {
    return {
      allowed: true,
      escalated: false,
      reason: "Read access is allowed.",
    };
  }

  if (isProtectedPath(options.root, target, protectedPaths)) {
    return {
      allowed: false,
      escalated: true,
      reason: "Target is inside a protected path.",
    };
  }

  if (request.action === "delete" && !options.allowDelete) {
    return {
      allowed: false,
      escalated: true,
      reason: "Delete access requires explicit approval.",
    };
  }

  if (!isInsideAllowedRoots(target, writableRoots, options.root)) {
    return {
      allowed: false,
      escalated: true,
      reason: "Target is outside configured writable roots.",
    };
  }

  return {
    allowed: true,
    escalated: false,
    reason: "Request is permitted by the local policy.",
  };
}

export function createPermissionGate(options: PermissionGateOptions) {
  return (request: PermissionRequest): PermissionDecision =>
    evaluatePermission(request, options);
}
