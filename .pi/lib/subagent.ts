import path from "node:path";

export type SubagentProfileName = "general" | "scout" | "reviewer" | "worker";
export type SubagentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type SubagentDisplayState = "running" | "done" | "failed" | "stopped";

export interface SubagentProfile {
  name: SubagentProfileName;
  summary: string;
  instructions: string;
}

export interface SubagentOptions {
  agent: SubagentProfileName;
  task: string;
  allowWrite?: boolean;
  model?: string;
  thinking?: SubagentThinkingLevel;
}

export interface ParsedSubagentCommand {
  agent: SubagentProfileName;
  task: string;
  allowWrite?: boolean;
  model?: string;
  thinking?: SubagentThinkingLevel;
}

export type ParseSubagentCommandResult =
  | { ok: true; options: ParsedSubagentCommand }
  | { ok: false; error: string };

export interface SubagentInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  tools: string[];
}

export interface ParsedSubagentKillCommand {
  targetId?: number;
  force: boolean;
}

export interface SubagentOutputPreview {
  lines: string[];
  carry: string;
}

export interface BuildSubagentProgressLinesOptions {
  runId: number;
  task: string;
  elapsedMs: number;
  toolCount: number;
  stdoutPreview: SubagentOutputPreview;
  stderrPreview: SubagentOutputPreview;
}

export interface BuildSubagentDisplayLinesOptions {
  state: SubagentDisplayState;
  runId: number;
  task: string;
  elapsedMs: number;
  toolCount: number;
  preview?: string;
}

export const DEFAULT_SUBAGENT_COMMAND: ParsedSubagentCommand = {
  agent: "general",
  task: "Help with the current repository in the most generally useful way. Inspect the codebase, identify important entry points or context, and return the most helpful concise result.",
};

export const SUBAGENT_COMMAND_USAGE =
  "Usage: /subagent [<general|scout|reviewer|worker> [--write] [--model <model>] [--thinking <level>] <task>]";
export const SUBAGENT_KILL_COMMAND = "/subagent-kill";
export const DEFAULT_SUBAGENT_PREVIEW_LINES = 6;
export const DEFAULT_SUBAGENT_PREVIEW_LINE_WIDTH = 120;

export const SUBAGENT_PROFILES: Record<SubagentProfileName, SubagentProfile> = {
  general: {
    name: "general",
    summary: "General-purpose delegated help for repo exploration, planning, or focused analysis.",
    instructions:
      "Handle the delegated task directly. Explore the relevant code or context, reason carefully, and return the most useful concise result.",
  },
  scout: {
    name: "scout",
    summary: "Fast read-only recon over relevant files and likely edit points.",
    instructions:
      "Scout the codebase quickly. Identify relevant files, summarize the current behavior, and call out likely edit points or risks.",
  },
  reviewer: {
    name: "reviewer",
    summary: "Read-only review for defects, regressions, and missing validation.",
    instructions:
      "Review the target area for correctness issues, regressions, risky assumptions, and missing validation. Prioritize concrete findings.",
  },
  worker: {
    name: "worker",
    summary: "Focused implementation or patching with minimal changes.",
    instructions:
      "Make the smallest complete change that satisfies the task. Keep edits tight, verify the result, and summarize residual risk.",
  },
};

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;
const WRITE_ENABLED_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;
const THINKING_LEVELS = new Set<SubagentThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export function getPiCliPath(root: string = process.cwd()): string {
  return path.resolve(root, "node_modules/@mariozechner/pi-coding-agent/dist/cli.js");
}

export function getSubagentDepth(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PI_SUBAGENT_DEPTH;
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function shouldRegisterSubagentTool(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSubagentDepth(env) < 1;
}

export function resolveSubagentTools(agent: SubagentProfileName, allowWrite: boolean = false): string[] {
  if (agent === "worker" && allowWrite) {
    return [...WRITE_ENABLED_TOOLS];
  }

  return [...READ_ONLY_TOOLS];
}

export function buildSubagentPrompt(options: Pick<SubagentOptions, "agent" | "allowWrite">): string {
  const profile = SUBAGENT_PROFILES[options.agent];
  const writeInstruction = options.allowWrite
    ? "You may use mutation tools when necessary, but keep changes minimal and respect repo guardrails."
    : "Operate in read-only mode. Do not claim to have changed files. Return findings, plans, or review notes only.";

  return [
    `You are the delegated ${profile.name} subagent.`,
    profile.instructions,
    writeInstruction,
    "Be concise, cite file paths when relevant, and return only the final useful result.",
  ].join("\n\n");
}

export function tokenizeSubagentCommand(input: string): string[] {
  const matches = input.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g);
  if (!matches) {
    return [];
  }

  return matches.map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1);
    }

    return token;
  });
}

export function parseSubagentCommand(input: string): ParseSubagentCommandResult {
  const tokens = tokenizeSubagentCommand(input.trim());
  if (tokens.length === 0) {
    return {
      ok: true,
      options: { ...DEFAULT_SUBAGENT_COMMAND },
    };
  }

  const [firstToken, ...remainingTokens] = tokens;
  const hasExplicitAgent = firstToken in SUBAGENT_PROFILES;
  const rest = hasExplicitAgent ? remainingTokens : tokens;

  const options: ParsedSubagentCommand = {
    agent: hasExplicitAgent ? firstToken as SubagentProfileName : DEFAULT_SUBAGENT_COMMAND.agent,
    task: "",
  };
  const taskParts: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--write" || token === "--allow-write") {
      options.allowWrite = true;
      continue;
    }

    if (token === "--model") {
      const value = rest[index + 1];
      if (!value) {
        return { ok: false, error: "Missing value for --model." };
      }
      options.model = value;
      index += 1;
      continue;
    }

    if (token === "--thinking") {
      const value = rest[index + 1];
      if (!value) {
        return { ok: false, error: "Missing value for --thinking." };
      }
      if (!THINKING_LEVELS.has(value as SubagentThinkingLevel)) {
        return {
          ok: false,
          error: `Invalid thinking level \"${value}\". Use off, minimal, low, medium, high, or xhigh.`,
        };
      }
      options.thinking = value as SubagentThinkingLevel;
      index += 1;
      continue;
    }

    if (token.startsWith("--") && hasExplicitAgent) {
      return { ok: false, error: `Unknown option \"${token}\".` };
    }

    taskParts.push(token);
  }

  if (taskParts.length === 0) {
    if (!hasExplicitAgent) {
      options.task = DEFAULT_SUBAGENT_COMMAND.task;
      return { ok: true, options };
    }

    return {
      ok: false,
      error: "Missing task. Example: /subagent scout map the auth flow",
    };
  }

  options.task = taskParts.join(" ");
  return { ok: true, options };
}

export function parseSubagentKillCommand(input: string):
  | { ok: true; options: ParsedSubagentKillCommand }
  | { ok: false; error: string } {
  const tokens = tokenizeSubagentCommand(input.trim());
  const options: ParsedSubagentKillCommand = { force: false };

  for (const token of tokens) {
    if (token === "--force" || token === "force") {
      options.force = true;
      continue;
    }

    if (/^\d+$/.test(token)) {
      if (options.targetId !== undefined) {
        return { ok: false, error: "Only one subagent id may be provided." };
      }
      options.targetId = Number.parseInt(token, 10);
      continue;
    }

    return {
      ok: false,
      error: `Invalid /subrm argument \"${token}\". Use /subrm [id] [--force].`,
    };
  }

  return { ok: true, options };
}

export function createSubagentInvocation(
  options: SubagentOptions,
  root: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): SubagentInvocation {
  const tools = resolveSubagentTools(options.agent, options.allowWrite ?? false);
  const args = [
    getPiCliPath(root),
    "--no-session",
    "--tools",
    tools.join(","),
    "--append-system-prompt",
    buildSubagentPrompt(options),
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.thinking) {
    args.push("--thinking", options.thinking);
  }

  args.push("-p", options.task);

  return {
    command: process.execPath,
    args,
    env: {
      ...env,
      PI_SUBAGENT_DEPTH: String(getSubagentDepth(env) + 1),
    },
    tools,
  };
}

export function createEmptySubagentOutputPreview(): SubagentOutputPreview {
  return {
    lines: [],
    carry: "",
  };
}

export function appendSubagentOutputPreview(
  preview: SubagentOutputPreview,
  chunk: string,
  maxLines: number = DEFAULT_SUBAGENT_PREVIEW_LINES,
): SubagentOutputPreview {
  const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const combined = `${preview.carry}${normalized}`;
  const parts = combined.split("\n");
  const carry = parts.pop() ?? "";
  const completeLines = parts
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return {
    lines: [...preview.lines, ...completeLines].slice(-maxLines),
    carry,
  };
}

export function formatSubagentElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

function truncatePreviewLine(line: string, maxWidth: number = DEFAULT_SUBAGENT_PREVIEW_LINE_WIDTH): string {
  const singleLine = line.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxWidth) {
    return singleLine;
  }

  return `${singleLine.slice(0, Math.max(0, maxWidth - 1))}…`;
}

function getPreviewCandidates(preview: SubagentOutputPreview): string[] {
  const lines = [...preview.lines];
  const carry = preview.carry.trim();
  if (carry.length > 0) {
    lines.push(carry);
  }

  return lines.map((line) => truncatePreviewLine(line)).filter((line) => line.length > 0);
}

export function getSubagentPreviewText(
  stdoutPreview: SubagentOutputPreview,
  stderrPreview: SubagentOutputPreview,
): string | undefined {
  const stderrLines = getPreviewCandidates(stderrPreview);
  if (stderrLines.length > 0) {
    return stderrLines.at(-1);
  }

  const stdoutLines = getPreviewCandidates(stdoutPreview);
  return stdoutLines.at(-1);
}

export function summarizeSubagentOutput(output: string): string | undefined {
  const lines = output
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => truncatePreviewLine(line))
    .filter((line) => line.length > 0);

  return lines[0];
}

export function buildSubagentDisplayLines(options: BuildSubagentDisplayLinesOptions): string[] {
  const header = `Subagent #${options.runId} ${options.task} (${formatSubagentElapsed(options.elapsedMs)}) | Tools: ${options.toolCount}`;

  return [
    header,
    options.preview ?? (options.state === "running" ? "Waiting for output..." : "(no output)"),
  ];
}

export function buildSubagentProgressLines(options: BuildSubagentProgressLinesOptions): string[] {
  return buildSubagentDisplayLines({
    state: "running",
    runId: options.runId,
    task: options.task,
    elapsedMs: options.elapsedMs,
    toolCount: options.toolCount,
    preview: getSubagentPreviewText(options.stdoutPreview, options.stderrPreview),
  });
}
