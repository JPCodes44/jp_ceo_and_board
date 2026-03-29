import test from "node:test";
import assert from "node:assert/strict";

import {
  appendSubagentOutputPreview,
  buildSubagentDisplayLines,
  buildSubagentProgressLines,
  buildSubagentPrompt,
  createEmptySubagentOutputPreview,
  createSubagentInvocation,
  DEFAULT_SUBAGENT_COMMAND,
  formatSubagentElapsed,
  getSubagentDepth,
  getSubagentPreviewText,
  parseSubagentCommand,
  parseSubagentKillCommand,
  resolveSubagentTools,
  shouldRegisterSubagentTool,
  summarizeSubagentOutput,
  tokenizeSubagentCommand,
} from "../.pi/lib/subagent.ts";

test("resolveSubagentTools keeps general and review profiles read-only", () => {
  assert.deepEqual(resolveSubagentTools("general"), ["read", "grep", "find", "ls"]);
  assert.deepEqual(resolveSubagentTools("scout"), ["read", "grep", "find", "ls"]);
  assert.deepEqual(resolveSubagentTools("reviewer"), ["read", "grep", "find", "ls"]);
});

test("resolveSubagentTools enables worker write tools only when requested", () => {
  assert.deepEqual(resolveSubagentTools("worker", false), ["read", "grep", "find", "ls"]);
  assert.deepEqual(resolveSubagentTools("worker", true), ["read", "bash", "edit", "write", "grep", "find", "ls"]);
});

test("buildSubagentPrompt reflects read-only and write-capable modes", () => {
  assert.match(buildSubagentPrompt({ agent: "general", allowWrite: false }), /read-only mode/i);
  assert.match(buildSubagentPrompt({ agent: "worker", allowWrite: true }), /mutation tools/i);
});

test("createSubagentInvocation increments recursion depth and appends task", () => {
  const invocation = createSubagentInvocation(
    {
      agent: "worker",
      task: "fix the failing test",
      allowWrite: true,
      model: "sonnet",
      thinking: "low",
    },
    process.cwd(),
    {},
  );

  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.env.PI_SUBAGENT_DEPTH, "1");
  assert.ok(invocation.args.includes("--model"));
  assert.ok(invocation.args.includes("--thinking"));
  assert.equal(invocation.args.at(-1), "fix the failing test");
});

test("shouldRegisterSubagentTool blocks nested subagent registration", () => {
  assert.equal(getSubagentDepth({}), 0);
  assert.equal(getSubagentDepth({ PI_SUBAGENT_DEPTH: "2" }), 2);
  assert.equal(shouldRegisterSubagentTool({}), true);
  assert.equal(shouldRegisterSubagentTool({ PI_SUBAGENT_DEPTH: "1" }), false);
});

test("tokenizeSubagentCommand preserves quoted segments", () => {
  assert.deepEqual(tokenizeSubagentCommand('worker --model sonnet "fix the failing test"'), [
    "worker",
    "--model",
    "sonnet",
    "fix the failing test",
  ]);
});

test("parseSubagentCommand parses flags and task", () => {
  const result = parseSubagentCommand('worker --write --model sonnet --thinking low "fix the failing test"');

  assert.equal(result.ok, true);
  if (result.ok !== true) {
    throw new Error("parseSubagentCommand unexpectedly failed");
  }

  assert.deepEqual(result.options, {
    agent: "worker",
    allowWrite: true,
    model: "sonnet",
    thinking: "low",
    task: "fix the failing test",
  });
});

test("parseSubagentCommand defaults to the general subagent when no args are provided", () => {
  const result = parseSubagentCommand("");

  assert.equal(result.ok, true);
  if (result.ok !== true) {
    throw new Error("parseSubagentCommand unexpectedly failed for empty input");
  }

  assert.deepEqual(result.options, DEFAULT_SUBAGENT_COMMAND);
});

test("parseSubagentCommand treats unknown first args as general prompt text", () => {
  const result = parseSubagentCommand("summarize the auth flow");

  assert.equal(result.ok, true);
  if (result.ok !== true) {
    throw new Error("parseSubagentCommand unexpectedly failed for freeform input");
  }

  assert.deepEqual(result.options, {
    agent: "general",
    task: "summarize the auth flow",
  });
});

test("parseSubagentCommand allows flags without an explicit agent", () => {
  const result = parseSubagentCommand('--model sonnet --thinking low summarize the auth flow');

  assert.equal(result.ok, true);
  if (result.ok !== true) {
    throw new Error("parseSubagentCommand unexpectedly failed for general-with-flags input");
  }

  assert.deepEqual(result.options, {
    agent: "general",
    model: "sonnet",
    thinking: "low",
    task: "summarize the auth flow",
  });
});

test("parseSubagentCommand rejects invalid input", () => {
  const badThinking = parseSubagentCommand("worker --thinking turbo fix auth");
  assert.equal(badThinking.ok, false);

  const badOption = parseSubagentCommand("worker --bogus fix auth");
  assert.equal(badOption.ok, false);
});

test("parseSubagentKillCommand parses optional id and force flag", () => {
  const result = parseSubagentKillCommand("4 --force");

  assert.equal(result.ok, true);
  if (result.ok !== true) {
    throw new Error("parseSubagentKillCommand unexpectedly failed");
  }

  assert.deepEqual(result.options, {
    targetId: 4,
    force: true,
  });
});

test("parseSubagentKillCommand defaults to the top subagent when no args are provided", () => {
  const result = parseSubagentKillCommand("");

  assert.equal(result.ok, true);
  if (result.ok !== true) {
    throw new Error("parseSubagentKillCommand unexpectedly failed for empty input");
  }

  assert.deepEqual(result.options, {
    force: false,
  });
});

test("parseSubagentKillCommand rejects invalid arguments", () => {
  const result = parseSubagentKillCommand("abc");
  assert.equal(result.ok, false);
});

test("appendSubagentOutputPreview keeps complete lines and carries partial output", () => {
  const initial = createEmptySubagentOutputPreview();
  const first = appendSubagentOutputPreview(initial, "line one\npartial");
  assert.deepEqual(first, {
    lines: ["line one"],
    carry: "partial",
  });

  const second = appendSubagentOutputPreview(first, " done\nline two\n");
  assert.deepEqual(second, {
    lines: ["line one", "partial done", "line two"],
    carry: "",
  });
});

test("formatSubagentElapsed renders compact durations", () => {
  assert.equal(formatSubagentElapsed(5_000), "5s");
  assert.equal(formatSubagentElapsed(65_000), "1m 05s");
  assert.equal(formatSubagentElapsed(3_665_000), "1h 01m 05s");
});

test("getSubagentPreviewText prefers latest stderr output", () => {
  const stdoutPreview = appendSubagentOutputPreview(createEmptySubagentOutputPreview(), "mapped files\nnext step");
  const stderrPreview = appendSubagentOutputPreview(createEmptySubagentOutputPreview(), "warning\n");

  assert.equal(getSubagentPreviewText(stdoutPreview, stderrPreview), "warning");
});

test("summarizeSubagentOutput returns the first non-empty line", () => {
  assert.equal(
    summarizeSubagentOutput("\n\n**pi-vs-cc** is a collection of extensions.\nSecond line."),
    "**pi-vs-cc** is a collection of extensions.",
  );
});

test("buildSubagentDisplayLines renders compact subagent cards", () => {
  assert.deepEqual(buildSubagentDisplayLines({
    state: "done",
    runId: 2,
    task: "summarize this codebase in 2 sentences",
    elapsedMs: 8_000,
    toolCount: 4,
    preview: "**pi-vs-cc** is a collection of extensions.",
  }), [
    "Subagent #2 summarize this codebase in 2 sentences (8s) | Tools: 4",
    "**pi-vs-cc** is a collection of extensions.",
  ]);
});

test("buildSubagentProgressLines renders a compact live widget", () => {
  const stdoutPreview = appendSubagentOutputPreview(createEmptySubagentOutputPreview(), "mapped files\nnext step");
  const stderrPreview = appendSubagentOutputPreview(createEmptySubagentOutputPreview(), "warning\n");

  assert.deepEqual(buildSubagentProgressLines({
    runId: 3,
    task: "fix failing tests",
    elapsedMs: 65_000,
    toolCount: 7,
    stdoutPreview,
    stderrPreview,
  }), [
    "Subagent #3 fix failing tests (1m 05s) | Tools: 7",
    "warning",
  ]);
});
