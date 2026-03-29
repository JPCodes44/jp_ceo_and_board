import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  DEFAULT_PROTECTED_PATHS,
  isProtectedPath,
  normalizeProtectedPaths,
} from "../.pi/lib/protected-paths.ts";

test("normalizeProtectedPaths resolves entries relative to repo root", () => {
  const root = process.cwd();
  const normalized = normalizeProtectedPaths(root, [".env", "infra"]);

  assert.equal(normalized.length, 2);
  assert.ok(normalized.every((entry) => path.isAbsolute(entry)));
});

test("isProtectedPath blocks direct protected files and directories", () => {
  const root = process.cwd();

  assert.equal(isProtectedPath(root, ".env", DEFAULT_PROTECTED_PATHS), true);
  assert.equal(isProtectedPath(root, ".pi/extensions/permission-gate.ts", DEFAULT_PROTECTED_PATHS), true);
  assert.equal(isProtectedPath(root, "README.md", DEFAULT_PROTECTED_PATHS), false);
});
