import { spawn, type ChildProcessByStdio } from "node:child_process";
import fs from "node:fs";
import type { Readable } from "node:stream";

import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

import {
  appendSubagentOutputPreview,
  buildSubagentDisplayLines,
  buildSubagentProgressLines,
  createEmptySubagentOutputPreview,
  createSubagentInvocation,
  formatSubagentElapsed,
  getPiCliPath,
  parseSubagentCommand,
  parseSubagentKillCommand,
  shouldRegisterSubagentTool,
  summarizeSubagentOutput,
  type ParsedSubagentCommand,
  type SubagentDisplayState,
  type SubagentOutputPreview,
  type SubagentProfileName,
  type SubagentThinkingLevel,
  SUBAGENT_COMMAND_USAGE,
  SUBAGENT_PROFILES,
} from "../lib/subagent.ts";

const ThinkingLevelSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("minimal"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("xhigh"),
]);

const SubagentParamsSchema = Type.Object({
  agent: Type.Union([
    Type.Literal("general"),
    Type.Literal("scout"),
    Type.Literal("reviewer"),
    Type.Literal("worker"),
  ], {
    description: "Subagent profile to run.",
  }),
  task: Type.String({
    description: "Task to delegate to the subagent.",
  }),
  allowWrite: Type.Optional(Type.Boolean({
    description: "Allow write-capable tools for the worker profile. Defaults to false.",
  })),
  model: Type.Optional(Type.String({
    description: "Optional model pattern or model id for the subagent.",
  })),
  thinking: Type.Optional(ThinkingLevelSchema),
});

type SubagentParams = Static<typeof SubagentParamsSchema>;

interface SubagentToolDetails {
  cliPath?: string;
  agent?: SubagentProfileName;
  summary?: string;
  task?: string;
  allowWrite?: boolean;
  model?: string;
  thinking?: SubagentThinkingLevel;
  tools?: string[];
  toolCount?: number;
  command?: string;
  args?: string[];
  exitCode?: number;
  signal?: NodeJS.Signals | null;
  stderr?: string;
  aborted?: boolean;
  pid?: number;
  runId?: number;
  durationMs?: number;
}

interface SubagentSummaryDetails extends SubagentToolDetails {
  state: SubagentDisplayState;
  preview?: string;
}

interface SpawnedSubagentResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  aborted: boolean;
}

interface ExecutedSubagentResult {
  output: string;
  details: SubagentToolDetails;
  isError: boolean;
}

interface SpawnSubagentProcessOptions {
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

interface RunningSubagentState {
  id: number;
  params: ParsedSubagentCommand;
  invocation: ReturnType<typeof createSubagentInvocation>;
  child: ChildProcessByStdio<null, Readable, Readable>;
  abortController: AbortController;
  startedAt: number;
  stdoutPreview: SubagentOutputPreview;
  stderrPreview: SubagentOutputPreview;
  stopRequested?: boolean;
  timer?: ReturnType<typeof setInterval>;
}

const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
};
const SUBAGENT_STATUS_KEY = "subagent";
const SUBAGENT_WIDGET_KEY = "subagent-progress";
const SUBAGENT_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SUBAGENT_KILL_TIMEOUT_MS = 3000;

let activeRun: RunningSubagentState | undefined;
let nextRunId = 1;

function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) {
    return 1;
  }

  return 128 + (SIGNAL_EXIT_CODES[signal] ?? 1);
}

function spawnSubagentProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: SpawnSubagentProcessOptions = {},
): { child: ChildProcessByStdio<null, Readable, Readable>; result: Promise<SpawnedSubagentResult> } {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let aborted = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    options.onStdout?.(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    options.onStderr?.(text);
  });

  const abortHandler = () => {
    aborted = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, SUBAGENT_KILL_TIMEOUT_MS);
      killTimer.unref?.();
    }
  };

  if (options.signal?.aborted) {
    abortHandler();
  } else {
    options.signal?.addEventListener("abort", abortHandler, { once: true });
  }

  const result = new Promise<SpawnedSubagentResult>((resolve, reject) => {
    child.on("error", (error) => {
      options.signal?.removeEventListener("abort", abortHandler);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      reject(error);
    });

    child.on("close", (code, signal) => {
      options.signal?.removeEventListener("abort", abortHandler);
      if (killTimer) {
        clearTimeout(killTimer);
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? exitCodeFromSignal(signal),
        signal,
        aborted,
      });
    });
  });

  return { child, result };
}

function createSubagentResult(
  params: ParsedSubagentCommand,
  invocation: ReturnType<typeof createSubagentInvocation>,
  result: SpawnedSubagentResult,
  extras: { pid?: number; runId?: number; durationMs?: number } = {},
): ExecutedSubagentResult {
  const profile = SUBAGENT_PROFILES[params.agent];
  const output = result.stdout || result.stderr || (result.aborted ? "(subagent stopped)" : "(no output)");
  const details: SubagentToolDetails = {
    agent: profile.name,
    summary: profile.summary,
    task: params.task,
    allowWrite: Boolean(params.allowWrite),
    model: params.model,
    thinking: params.thinking,
    tools: invocation.tools,
    toolCount: invocation.tools.length,
    command: invocation.command,
    args: invocation.args,
    exitCode: result.exitCode,
    signal: result.signal,
    stderr: result.stderr,
    aborted: result.aborted,
    pid: extras.pid,
    runId: extras.runId,
    durationMs: extras.durationMs,
  };

  return {
    output,
    details,
    isError: result.exitCode !== 0 && !result.aborted,
  };
}

function buildSubagentSummaryDetails(
  result: ExecutedSubagentResult,
  state: SubagentDisplayState,
): SubagentSummaryDetails {
  return {
    ...result.details,
    state,
    preview: summarizeSubagentOutput(result.output),
  };
}

function renderSubagentSummaryCard(message: { content: string; details?: unknown }, expanded: boolean, theme: ExtensionCommandContext["ui"]["theme"]) {
  const details = message.details as SubagentSummaryDetails | undefined;
  if (!details?.task || details.runId === undefined || details.durationMs === undefined || details.toolCount === undefined) {
    return undefined;
  }

  const symbol = details.state === "done"
    ? "✓"
    : details.state === "failed"
      ? "✕"
      : details.state === "stopped"
        ? "■"
        : "↻";
  const symbolColor = details.state === "done"
    ? "success"
    : details.state === "failed"
      ? "error"
      : details.state === "stopped"
        ? "warning"
        : "accent";

  const [header, preview] = buildSubagentDisplayLines({
    state: details.state,
    runId: details.runId,
    task: details.task,
    elapsedMs: details.durationMs,
    toolCount: details.toolCount,
    preview: details.preview,
  });

  const lines = [
    `${theme.fg(symbolColor, symbol)} ${theme.fg("accent", header)}`,
    theme.fg("muted", preview),
  ];

  if (expanded && message.content.trim() && message.content.trim() !== preview.trim()) {
    lines.push("", theme.fg("dim", message.content.trim()));
  }

  const box = new Box(1, 1, (text: string) => theme.bg("customMessageBg", text));
  box.addChild(new Text(lines.join("\n"), 0, 0));
  return box;
}

async function executeSubagentTask(
  params: ParsedSubagentCommand,
  signal?: AbortSignal,
): Promise<ExecutedSubagentResult> {
  const cliPath = getPiCliPath(process.cwd());
  if (!fs.existsSync(cliPath)) {
    return {
      output: `Pi CLI not found at ${cliPath}`,
      details: { cliPath },
      isError: true,
    };
  }

  const invocation = createSubagentInvocation(params, process.cwd(), process.env);
  const spawned = spawnSubagentProcess(
    invocation.command,
    invocation.args,
    process.cwd(),
    invocation.env,
    { signal },
  );
  const startedAt = Date.now();
  const result = await spawned.result;
  return createSubagentResult(params, invocation, result, {
    pid: spawned.child.pid,
    durationMs: Date.now() - startedAt,
  });
}

function clearSubagentUi(ctx: ExtensionCommandContext): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.setStatus(SUBAGENT_STATUS_KEY, undefined);
  ctx.ui.setWidget(SUBAGENT_WIDGET_KEY, undefined, { placement: "belowEditor" });
}

function renderRunningSubagent(ctx: ExtensionCommandContext, state: RunningSubagentState): void {
  if (!ctx.hasUI) {
    return;
  }

  const elapsedMs = Date.now() - state.startedAt;
  const frame = SUBAGENT_SPINNER_FRAMES[Math.floor(elapsedMs / 120) % SUBAGENT_SPINNER_FRAMES.length];
  const theme = ctx.ui.theme;
  const lines = buildSubagentProgressLines({
    runId: state.id,
    task: state.params.task,
    elapsedMs,
    toolCount: state.invocation.tools.length,
    stdoutPreview: state.stdoutPreview,
    stderrPreview: state.stderrPreview,
  });

  ctx.ui.setStatus(
    SUBAGENT_STATUS_KEY,
    theme.fg("accent", `${frame} Subagent #${state.id} ${formatSubagentElapsed(elapsedMs)}`),
  );
  ctx.ui.setWidget(
    SUBAGENT_WIDGET_KEY,
    [
      `${theme.fg("accent", frame)} ${theme.fg("accent", lines[0])}`,
      theme.fg("muted", lines[1]),
    ],
    { placement: "belowEditor" },
  );
}

function notifyCompletion(ctx: ExtensionCommandContext, result: ExecutedSubagentResult): void {
  if (result.details.aborted) {
    ctx.ui.notify(`Subagent #${result.details.runId} stopped.`, "warning");
    return;
  }

  if (result.isError) {
    ctx.ui.notify(`Subagent #${result.details.runId} failed.`, "error");
    return;
  }

  ctx.ui.notify(`Subagent #${result.details.runId} finished.`, "info");
}

async function finishBackgroundRun(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: RunningSubagentState,
  outcome: SpawnedSubagentResult | Error,
): Promise<void> {
  if (state.timer) {
    clearInterval(state.timer);
  }

  if (activeRun === state) {
    activeRun = undefined;
  }
  clearSubagentUi(ctx);

  if (outcome instanceof Error) {
    const details: SubagentSummaryDetails = {
      agent: state.params.agent,
      task: state.params.task,
      runId: state.id,
      durationMs: Date.now() - state.startedAt,
      toolCount: state.invocation.tools.length,
      state: "failed",
      preview: outcome.message,
      tools: state.invocation.tools,
    };
    pi.sendMessage({
      customType: "subagent-summary",
      content: outcome.message,
      display: true,
      details,
    });
    ctx.ui.notify(`Subagent #${state.id} failed: ${outcome.message}`, "error");
    return;
  }

  const result = createSubagentResult(
    state.params,
    state.invocation,
    { ...outcome, aborted: outcome.aborted || Boolean(state.stopRequested) },
    {
      pid: state.child.pid,
      runId: state.id,
      durationMs: Date.now() - state.startedAt,
    },
  );
  const summaryState: SubagentDisplayState = result.details.aborted ? "stopped" : result.isError ? "failed" : "done";

  pi.sendMessage({
    customType: "subagent-summary",
    content: result.output,
    display: true,
    details: buildSubagentSummaryDetails(result, summaryState),
  });
  notifyCompletion(ctx, result);
}

function startBackgroundRun(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  params: ParsedSubagentCommand,
): void {
  const cliPath = getPiCliPath(process.cwd());
  if (!fs.existsSync(cliPath)) {
    const message = `Pi CLI not found at ${cliPath}`;
    ctx.ui.notify(message, "error");
    pi.sendMessage({
      customType: "subagent-summary",
      content: message,
      display: true,
      details: {
        agent: params.agent,
        task: params.task,
        runId: nextRunId,
        durationMs: 0,
        toolCount: 0,
        state: "failed",
        preview: message,
      } satisfies SubagentSummaryDetails,
    });
    return;
  }

  const invocation = createSubagentInvocation(params, process.cwd(), process.env);
  const abortController = new AbortController();
  const runId = nextRunId;
  nextRunId += 1;

  let state: RunningSubagentState | undefined;
  const spawned = spawnSubagentProcess(
    invocation.command,
    invocation.args,
    process.cwd(),
    invocation.env,
    {
      signal: abortController.signal,
      onStdout: (chunk) => {
        if (!state) {
          return;
        }
        state.stdoutPreview = appendSubagentOutputPreview(state.stdoutPreview, chunk);
      },
      onStderr: (chunk) => {
        if (!state) {
          return;
        }
        state.stderrPreview = appendSubagentOutputPreview(state.stderrPreview, chunk);
      },
    },
  );

  state = {
    id: runId,
    params,
    invocation,
    child: spawned.child,
    abortController,
    startedAt: Date.now(),
    stdoutPreview: createEmptySubagentOutputPreview(),
    stderrPreview: createEmptySubagentOutputPreview(),
  };

  activeRun = state;
  renderRunningSubagent(ctx, state);
  state.timer = setInterval(() => {
    if (activeRun !== state) {
      return;
    }
    renderRunningSubagent(ctx, state);
  }, 250);
  state.timer.unref?.();

  ctx.ui.notify(
    `Subagent #${runId} started${params.allowWrite ? " with write access" : ""}. Use /subagent-kill to stop it.`,
    params.allowWrite ? "warning" : "info",
  );

  void spawned.result
    .then((result) => finishBackgroundRun(pi, ctx, state, result))
    .catch((error) => finishBackgroundRun(pi, ctx, state, error instanceof Error ? error : new Error(String(error))));
}

export default function subagentExtension(pi: ExtensionAPI) {
  if (!shouldRegisterSubagentTool()) {
    return;
  }

  pi.registerMessageRenderer("subagent-summary", (message, { expanded }, theme) =>
    renderSubagentSummaryCard({
      content: typeof message.content === "string"
        ? message.content
        : message.content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join(""),
      details: message.details,
    }, expanded, theme));

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Spawn an isolated Pi subprocess for scouting, reviewing, or focused work. Defaults to read-only delegation.",
    parameters: SubagentParamsSchema,

    async execute(_toolCallId, params, signal) {
      const result = await executeSubagentTask(params, signal);
      return {
        content: [{ type: "text", text: result.output }],
        details: result.details,
        isError: result.isError,
      };
    },
  });

  pi.registerCommand("subagent", {
    description:
      "Run a subagent in the background with live status. Usage: /subagent [<general|scout|reviewer|worker> [--write] [--model <model>] [--thinking <level>] <task>]",
    handler: async (args, ctx) => {
      const parsed = parseSubagentCommand(args);
      if (!parsed.ok) {
        ctx.ui.notify(parsed.error || SUBAGENT_COMMAND_USAGE, "warning");
        return;
      }

      if (activeRun) {
        ctx.ui.notify(
          `Subagent #${activeRun.id} is already running. Use /subagent-kill before starting another one.`,
          "warning",
        );
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy. Wait for the current turn to finish before using /subagent.", "warning");
        return;
      }

      if (!ctx.hasUI) {
        const result = await executeSubagentTask(parsed.options);
        pi.sendMessage({
          customType: "subagent-summary",
          content: result.output,
          display: true,
          details: buildSubagentSummaryDetails(result, result.isError ? "failed" : "done"),
        });
        return;
      }

      startBackgroundRun(pi, ctx, parsed.options);
    },
  });

  const killSubagentHandler = async (args: string, ctx: ExtensionCommandContext) => {
    const parsed = parseSubagentKillCommand(args);
    if (!parsed.ok) {
      ctx.ui.notify(parsed.error, "warning");
      return;
    }

    const run = activeRun;
    if (!run) {
      ctx.ui.notify("No background subagent is running.", "info");
      return;
    }

    if (parsed.options.targetId !== undefined && parsed.options.targetId != run.id) {
      ctx.ui.notify(`Subagent #${parsed.options.targetId} is not running. Top subagent is #${run.id}.`, "warning");
      return;
    }

    if (parsed.options.force) {
      run.stopRequested = true;
      if (run.child.exitCode === null && run.child.signalCode === null) {
        run.child.kill("SIGKILL");
      }
      ctx.ui.notify(`Force-killing subagent #${run.id}...`, "warning");
      return;
    }

    run.stopRequested = true;
    run.abortController.abort();
    ctx.ui.notify(`Stopping subagent #${run.id}...`, "warning");
    renderRunningSubagent(ctx, run);
  };

  pi.registerCommand("subagent-kill", {
    description: "Stop the currently running background subagent. Usage: /subagent-kill [id] [--force]",
    handler: killSubagentHandler,
  });

  pi.registerCommand("subrm", {
    description: "Alias for /subagent-kill. Usage: /subrm [id] [--force]",
    handler: killSubagentHandler,
  });

  pi.on("session_shutdown", async () => {
    if (activeRun) {
      activeRun.stopRequested = true;
      activeRun.abortController.abort();
    }
  });
}
