import test from "node:test";
import assert from "node:assert/strict";

import {
  detectTaskMode,
  recommendedPrompt,
} from "../.pi/extensions/task-mode.ts";

test("detectTaskMode matches review-oriented input", () => {
  const result = detectTaskMode("please review the current changes for regressions");

  assert.equal(result.mode, "repo-review");
});

test("detectTaskMode matches implementation-oriented input", () => {
  const result = detectTaskMode("implement the protected path guard");

  assert.equal(result.mode, "ship-task");
});

test("recommendedPrompt returns the expected prompt path", () => {
  assert.equal(recommendedPrompt("repo-review"), ".pi/prompts/review.md");
  assert.equal(recommendedPrompt("ship-task"), ".pi/prompts/prime.md");
  assert.equal(recommendedPrompt("general"), ".pi/SYSTEM.md");
});
