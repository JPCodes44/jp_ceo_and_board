import test from "node:test";
import assert from "node:assert/strict";

import {
  createPermissionGate,
  evaluatePermission,
} from "../.pi/lib/permission-policy.ts";
import { shouldGateCommand } from "../.pi/extensions/permission-gate.ts";

test("evaluatePermission blocks writes inside protected paths", () => {
  const result = evaluatePermission(
    {
      action: "write",
      target: ".env",
    },
    {
      root: process.cwd(),
    },
  );

  assert.equal(result.allowed, false);
  assert.equal(result.escalated, true);
});

test("evaluatePermission allows writes inside configured writable roots", () => {
  const result = evaluatePermission(
    {
      action: "write",
      target: "docs/runbook.md",
    },
    {
      root: process.cwd(),
      writableRoots: ["docs", "src", "tests"],
    },
  );

  assert.equal(result.allowed, true);
  assert.equal(result.escalated, false);
});

test("createPermissionGate returns stable decisions", () => {
  const gate = createPermissionGate({
    root: process.cwd(),
    writableRoots: ["docs", "src", "tests"],
  });

  assert.equal(gate({ action: "read", target: "README.md" }).allowed, true);
  assert.equal(gate({ action: "delete", target: "docs/runbook.md" }).allowed, false);
});

test("shouldGateCommand detects risky bash commands", () => {
  assert.equal(shouldGateCommand("git push origin main"), true);
  assert.equal(shouldGateCommand("rm -rf dist"), true);
  assert.equal(shouldGateCommand("npm test"), false);
});
