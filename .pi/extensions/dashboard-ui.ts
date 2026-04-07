import type {
  AgentToolUpdateCallback,
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from '@mariozechner/pi-coding-agent';
import type { Component, TUI } from '@mariozechner/pi-tui';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DispatchSchema {
  _toolCallId: string;
  params: string;
  _signal: AbortSignal | undefined;
  _onUpdate: AgentToolUpdateCallback<unknown> | undefined;
  _ctx: ExtensionContext;
}

interface DispatchRunDetails {
  agent: string;
  task: string;
  dependsOn: string[];
  status: 'pending' | 'starting' | 'done' | 'error';
  output?: string;
  exitCode?: number;
  elapsed?: number;
}

interface DispatchToolDetails {
  status: 'running' | 'done' | 'error';
  runs: DispatchRunDetails[];
}

export default function Dashboard(pi: ExtensionAPI) {
  let selectedTeam: string | null = null;
  let currentMembers: string[] = [];
  const dispatchedAgents = new Set<string>();
  const agentLogs = new Map<string, string[]>();
  const agentModelOverrides = new Map<string, string>();

  // Fix 3: single module-level variable holding the current team context to inject.
  // Updated by team-select; read by the single before_agent_start listener registered below.
  let selectedTeamContext: string = '';

  // Fix 4: Cache process.cwd() once at module load to avoid repeated syscalls.
  const rootDir = process.cwd();

  const DEFAULT_MODEL = 'openrouter/ollama/qwen3-next:80b-cloud';

  let sessionModel = DEFAULT_MODEL;

  const toQualifiedModel = (
    model?: { provider?: string; id?: string } | null,
  ): string | undefined => {
    if (!model?.id) return undefined;
    return model.id.includes('/') ? model.id : `${model.provider}/${model.id}`;
  };

  const syncSessionModel = (
    model?: { provider?: string; id?: string } | null,
  ) => {
    const qualifiedModel = toQualifiedModel(model);
    if (qualifiedModel) {
      sessionModel = qualifiedModel;
    }
  };

  const getEffectiveModel = (agent: string) => {
    const override = agentModelOverrides.get(agent);
    return {
      value: override ?? sessionModel,
      source: override ? 'override' : 'inherited',
    };
  };

  // ---------------------------------------------------------------------------
  // Core helpers — readFileSync lives here only; never called from render().
  // ---------------------------------------------------------------------------
  const getTeams = (): Record<string, string[]> => {
    try {
      // expected format in .pi/agents/teams.yaml:
      // board:
      //   - ceo
      //   - technical-architect
      const dir = join(rootDir, '.pi', 'agents');
      const yamlPath = join(dir, 'teams.yaml');
      const yaml = readFileSync(yamlPath, 'utf-8');

      const teamMembers: Record<string, string[]> = {};
      let currentTeam: string | null = null;

      for (const line of yaml.split('\n')) {
        const teamMatch = line.match(/^([a-z0-9-]+):\s*$/i);
        if (teamMatch) {
          currentTeam = teamMatch[1];
          teamMembers[currentTeam] = [];
          continue;
        }

        const memberMatch = line.match(/^\s*-\s*([a-z0-9-]+)\s*$/i);
        if (memberMatch && currentTeam) {
          teamMembers[currentTeam].push(memberMatch[1]);
        }
      }

      return teamMembers;
    } catch {
      return {};
    }
  };

  const getMemberLines = (member: string): string[] => {
    const dir = join(rootDir, '.pi', 'agents');
    const mdPath = join(dir, `${member}.md`);
    if (!existsSync(mdPath)) {
      return [];
    }
    return readFileSync(mdPath, 'utf-8').split('\n');
  };

  // ---------------------------------------------------------------------------
  // Fix 1: Module-level cache — populated once at load time, refreshed on
  // team-select. The render() loop reads only from these variables.
  // ---------------------------------------------------------------------------
  let cachedTeams: Record<string, string[]> = {};
  let cachedMemberDocs: Record<string, string[]> = {};

  const refreshCache = () => {
    cachedTeams = getTeams();
    cachedMemberDocs = {};
    for (const members of Object.values(cachedTeams)) {
      for (const member of members) {
        if (!(member in cachedMemberDocs)) {
          cachedMemberDocs[member] = getMemberLines(member);
        }
      }
    }
  };

  // Populate cache immediately at module load time.
  refreshCache();

  // ---------------------------------------------------------------------------
  // Team prompt helper — reads from cache, never calls readFileSync directly.
  // ---------------------------------------------------------------------------
  const getTeamPromptLines = (team: string, members: string[]): string[] => {
    const lines: string[] = [`Team members: ${members.join(', ')}`, ''];

    for (const member of members) {
      const memberLines = cachedMemberDocs[member] ?? [];
      if (memberLines.length === 0) {
        continue;
      }
      lines.push(`## ${member}`);
      lines.push(...memberLines);
      lines.push('');
    }

    if (lines.length === 2) {
      return [`Team ${team} has no configured member briefs.`];
    }

    return lines;
  };

  // ---------------------------------------------------------------------------
  // Dashboard widget — render() reads only from in-memory state; no I/O.
  // ---------------------------------------------------------------------------
  const renderDispatchResult = (
    result: AgentToolResult<undefined | DispatchToolDetails | unknown>,
    options: ToolRenderResultOptions,
    theme: Theme,
  ): Component => {
    const details = result.details as DispatchToolDetails | undefined;
    if (!details) {
      const text = result.content[0];
      return new Text(text?.type === 'text' ? text.text : '', 0, 0);
    }

    const iconForStatus = (status: DispatchRunDetails['status']) => {
      switch (status) {
        case 'done':
          return theme.fg('success', '✓');
        case 'error':
          return theme.fg('error', '✗');
        case 'starting':
          return theme.fg('warning', '⏳');
        default:
          return theme.fg('muted', '○');
      }
    };

    const summarizeOutput = (output?: string) => {
      if (!output) return theme.fg('muted', '(no output yet)');
      const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) return theme.fg('muted', '(no output yet)');
      const limit = options.expanded ? 8 : 3;
      const visible = lines.slice(0, limit).join('\n');
      return options.expanded || lines.length <= limit
        ? visible
        : `${visible}\n${theme.fg('muted', '...')}`;
    };

    const doneCount = details.runs.filter(
      (run) => run.status === 'done',
    ).length;
    const errorCount = details.runs.filter(
      (run) => run.status === 'error',
    ).length;
    const startingCount = details.runs.filter(
      (run) => run.status === 'starting',
    ).length;
    const headerIcon =
      details.status === 'error'
        ? theme.fg('warning', '◐')
        : details.status === 'running'
          ? theme.fg('warning', '⏳')
          : theme.fg('success', '✓');

    let text = `${headerIcon} ${theme.fg('toolTitle', theme.bold('dispatch_agent '))}${theme.fg('accent', `${doneCount}/${details.runs.length} done`)}`;
    if (startingCount > 0) {
      text += theme.fg('muted', `, ${startingCount} running`);
    }
    if (errorCount > 0) {
      text += theme.fg('muted', `, ${errorCount} failed`);
    }

    for (const run of details.runs) {
      const elapsedLabel =
        typeof run.elapsed === 'number'
          ? theme.fg('muted', ` (${Math.round(run.elapsed / 1000)}s)`)
          : '';
      const dependencyLabel =
        run.dependsOn.length > 0
          ? theme.fg('muted', ` deps: ${run.dependsOn.join(', ')}`)
          : '';
      text += `\n\n${iconForStatus(run.status)} ${theme.fg('accent', run.agent)}${elapsedLabel}`;
      text += `\n${theme.fg('dim', run.task)}`;
      if (dependencyLabel) {
        text += `\n${dependencyLabel}`;
      }
      text += `\n${theme.fg('toolOutput', summarizeOutput(run.output))}`;
    }

    return new Text(text, 0, 0);
  };

  const dashboardWidget = (): ((tui: TUI, theme: Theme) => Component) => {
    return (_tui, theme) => {
      return {
        render(width: number): string[] {
          const border = (s: string) => theme.fg('border', s);
          const accent = (s: string) => theme.fg('accent', s);
          const muted = (s: string) => theme.fg('muted', s);

          // Fix 1: use cached values — no readFileSync inside render().
          const teams = cachedTeams;
          const teamNames = Object.keys(teams);
          const currentTeam =
            selectedTeam && teams[selectedTeam]
              ? selectedTeam
              : (teamNames[0] ?? null);
          const members = currentTeam ? teams[currentTeam] : [];

          // Fix 1: read member docs from cache only.
          const memberDocs: Record<string, string[]> = {};
          for (const member of members) {
            memberDocs[member] = cachedMemberDocs[member] ?? [];
          }

          const cardWidth = Math.max(32, Math.min(56, width - 2));
          const gap = '  ';
          const maxFitPerRow = Math.max(
            1,
            Math.floor((width + gap.length) / (cardWidth + gap.length)),
          );
          const cardsPerRow = Math.min(3, maxFitPerRow);

          const allNames = members.length > 0 ? members : ['Planner'];
          const cards = allNames.map((name) => {
            const inner = cardWidth - 2;
            const line = (value: string, paint?: (s: string) => string) => {
              const padded = ` ${value}`.padEnd(inner, ' ');
              return `│${paint ? paint(padded) : padded}│`;
            };

            const isDispatched = dispatchedAgents.has(name);
            const statusIcon = isDispatched
              ? '● dispatched'
              : `○ ${currentTeam ?? 'unassigned'}`;
            const statusBar = isDispatched ? '[████] active' : '[───] idle';
            const paintStatus = isDispatched ? accent : muted;
            const paintBar = isDispatched ? accent : border;

            const logs = agentLogs.get(name) || [];
            const logLines = logs.map((l) =>
              line(l.trim().slice(0, inner - 2), muted),
            );
            while (logLines.length < 3) logLines.push(line('', muted));

            // Model override line — always present to keep card heights uniform.
            // Shows the selected model when set, blank row when inheriting.
            const effectiveModel = getEffectiveModel(name);
            const modelLine = line(
              `⬡ ${effectiveModel.value} (${effectiveModel.source})`.slice(
                0,
                inner - 1,
              ),
              effectiveModel.source === 'override' ? accent : muted,
            );

            return [
              border(`┌${'─'.repeat(inner)}┐`),
              line(name, accent),
              line(statusIcon, paintStatus),
              line(statusBar, paintBar),
              modelLine,
              ...logLines,
              border(`└${'─'.repeat(inner)}┘`),
            ];
          });

          const lines: string[] = [
            accent(`Team: ${currentTeam ?? 'none selected'}`),
            '',
          ];

          const height = cards[0]?.length ?? 0;
          for (let start = 0; start < cards.length; start += cardsPerRow) {
            const rowCards = cards.slice(start, start + cardsPerRow);
            for (let row = 0; row < height; row += 1) {
              lines.push(rowCards.map((card) => card[row]).join(gap));
            }
            if (start + cardsPerRow < cards.length) {
              lines.push('');
            }
          }

          return lines;
        },
        invalidate() {},
      };
    };
  };

  // ---------------------------------------------------------------------------
  // team-select command
  // ---------------------------------------------------------------------------
  pi.registerCommand('team-select', {
    description: 'Select a team to view its dashboard',
    handler: async (_event, ctx) => {
      // Fix 1 + Fix 5: call getTeams() exactly once, store result, reuse it.
      // Fix 1: also refresh the module-level cache so render() stays current.
      refreshCache();
      const teams = cachedTeams;
      const teamNames = Object.keys(teams);
      if (teamNames.length === 0) {
        return;
      }

      const selected = await ctx.ui.select('Select a team', teamNames);
      if (!selected) {
        return;
      }

      selectedTeam = selected;
      // Fix 5: reuse `teams` already fetched above — no second getTeams() call.
      currentMembers = teams[selected] ?? [];

      // Fix 3: update the shared variable; the single listener below will pick
      // it up on the next agent start. No new listener is registered here.
      const members = currentMembers;
      selectedTeamContext = `## Selected Team: ${selected}\n\n${getTeamPromptLines(selected, members).join('\n')}`;

      ctx.ui.setWidget('agent-dashboard', dashboardWidget(), {
        placement: 'aboveEditor',
      });

      // Fix 3: listener registration removed from here — it now lives at
      // module load time as a single persistent listener (see below).
    },
  });

  // ---------------------------------------------------------------------------
  // /agent-model command — reuses currentMembers and cachedTeams loaded by
  // team-select so no extra I/O is needed. Parses {p} (the raw args string)
  // to resolve the target agent, then shows a model picker popup.
  // ---------------------------------------------------------------------------
  pi.registerCommand('agent-model', {
    description:
      'Set model override for a specific team member (usage: /agent-model [member])',
    handler: async (args, ctx) => {
      // currentMembers is the live module-level ref populated by team-select
      // and session_start — same source of truth, no extra file reads.
      if (currentMembers.length === 0) {
        ctx.ui.notify('No team loaded. Run /team-select first.', 'warning');
        return;
      }

      // Parse {p}: trim the raw args string and check against currentMembers.
      // This mirrors how team-select resolves its teamNames from cachedTeams.
      const argStr = String(args ?? '').trim();
      let targetAgent: string | undefined;

      if (argStr && currentMembers.includes(argStr)) {
        // Caller passed a valid member name directly — use it without a picker.
        targetAgent = argStr;
      } else {
        // No arg (or unrecognised arg) — show the same member list that
        // team-select builds from cachedTeams so the UX is consistent.
        targetAgent = await ctx.ui.select(
          'Select team member to configure model',
          currentMembers,
        );
        if (!targetAgent) return;
      }

      // Show model picker — populated from the live model registry, same pool
      // as PI's own /model command. Only models with auth configured are shown.
      const currentOverride = agentModelOverrides.get(targetAgent);
      const pickerTitle = currentOverride
        ? `Model for ${targetAgent} (current: ${currentOverride})`
        : `Model for ${targetAgent} (currently inheriting session model)`;

      // Build the model list from the live registry — same pool as PI's /model command.
      // getAvailable() returns only models that have API keys configured.
      const registryModels = ctx.modelRegistry.getAvailable();
      const modelOptions = [
        '(inherit from session)',
        '(enter custom model...)',
        ...registryModels.map((m) => `${m.provider}/${m.id}`),
      ];

      const modelChoice = await ctx.ui.select(pickerTitle, modelOptions);
      if (!modelChoice) return;

      if (modelChoice === '(inherit from session)') {
        agentModelOverrides.delete(targetAgent);
        ctx.ui.setStatus(`agent-model-${targetAgent}`, undefined);
        ctx.ui.notify(`${targetAgent}: reverted to session model`, 'info');
        return;
      }

      let finalModel: string;
      if (modelChoice === '(enter custom model...)') {
        const custom = await ctx.ui.input(`Custom model ID for ${targetAgent}`);
        if (!custom?.trim()) return;
        finalModel = custom.trim();
      } else {
        finalModel = modelChoice;
      }

      agentModelOverrides.set(targetAgent, finalModel);
      ctx.ui.setStatus(
        `agent-model-${targetAgent}`,
        `🧠 ${targetAgent}: ${finalModel}`,
      );
      ctx.ui.notify(`${targetAgent} will use: ${finalModel}`, 'info');
    },
  });

  // ---------------------------------------------------------------------------
  // Fix 3: single persistent before_agent_start listener.
  // Registered once at module load time. Injects the current team context
  // (if any) and always appends the orchestrator mode prompt in one pass.
  // ---------------------------------------------------------------------------
  pi.on('before_agent_start', async (_event, ctx) => {
    syncSessionModel(ctx.model);

    const activeTeamName = selectedTeam ?? 'none';
    const teamMembers = currentMembers.join(', ');
    const teamContext = selectedTeamContext ? `\n\n${selectedTeamContext}` : '';

    return {
      systemPrompt: `${_event.systemPrompt}${teamContext}

## Orchestrator Mode

You do NOT have direct access to the codebase. You MUST delegate all work through
agents using the dispatch_agent tool.

## Active Team: ${activeTeamName}
Members: ${teamMembers}
You can ONLY dispatch to agents listed above. Do not attempt to dispatch to agents outside this team.

## How to Work
- Analyze the user's request and break it into clear sub-tasks
- Choose the right agent(s) for each sub-task
- Dispatch tasks using the dispatch_agent tool
- Review results and dispatch follow-up agents if needed
- If a task fails, try a different agent or adjust the task description
- Summarize the outcome for the user

## Parallelism & Dependencies
- By default, batch all agents into ONE dispatch_agent call so they run in parallel
- Use dependsOn when an agent genuinely needs another agent's output to do its job
- Agents with dependsOn will automatically receive the upstream agent's output injected into their task
- Example: researcher runs in parallel with analyst, but writer dependsOn both
- Never use dependsOn just to serialize — only use it when the output is actually needed as input

## Rules
- NEVER try to read, write, or execute code directly — you have no such tools
- ALWAYS use dispatch_agent to get work done
- Prefer one dispatch_agent call with multiple agents over multiple sequential calls
- Keep tasks focused — one clear objective per dispatch`,
    };
  });

  // ---------------------------------------------------------------------------
  // Dispatch helper
  // ---------------------------------------------------------------------------
  const dispatchAgent = async (
    agent: string,
    task: string,
    ctx: ExtensionContext,
    signal?: AbortSignal,
    _onUpdate?: AgentToolUpdateCallback<unknown>,
  ): Promise<{ output: string; exitCode: number; elapsed: number }> => {
    // Use per-agent override set by /agent-model; fall back to the inherited
    // session model, then the hardcoded default — same priority order as team-select.
    const inheritedModel = toQualifiedModel(ctx.model) ?? sessionModel;
    const modelArg = agentModelOverrides.get(agent) ?? inheritedModel;
    // Fix 5: Pass the cached agent brief content directly instead of a file path,
    // so each sub-agent launch always uses the in-memory version without a disk
    // read. The `pi` CLI's --append-system-prompt flag expects a file path (not
    // raw text), so we write the cached lines to a per-agent temp file and pass
    // that. This is cheaper than re-reading the original file on every launch
    // and guarantees the in-memory cache is what gets used.
    // If the cache is empty or undefined, fall back to the original file path
    // so behaviour is identical to before for uncached agents.
    const cachedLines = cachedMemberDocs[agent];
    let appendSystemPromptArg: string;
    if (cachedLines && cachedLines.length > 0) {
      const tmpPath = join(tmpdir(), `pi-agent-brief-${agent}.md`);
      writeFileSync(tmpPath, cachedLines.join('\n'), 'utf-8');
      appendSystemPromptArg = tmpPath;
    } else {
      // Fall back to original file path when no cached content is available.
      appendSystemPromptArg = join(rootDir, '.pi', 'agents', `${agent}.md`);
    }

    const args = [
      '--print',
      '--no-session',
      '--no-extensions',
      '--no-themes',
      '--model',
      modelArg,
      '--append-system-prompt',
      appendSystemPromptArg,
      task,
    ];

    const startTime = Date.now();

    // Fix 4: removed redundant setWidget calls — agentLogs mutations are
    // sufficient; the already-registered widget reads from the shared Map.
    agentLogs.set(agent, ['Starting...']);

    // Fix 4: use rootDir instead of process.cwd().
    const result = await pi.exec('pi', args, { signal, cwd: rootDir });

    const lastLines = (result.stdout || result.stderr || '')
      .split('\n')
      .filter((l) => l.trim())
      .slice(-3);
    agentLogs.set(agent, lastLines.length > 0 ? lastLines : ['Done.']);

    return {
      output: result.stdout || result.stderr,
      exitCode: result.code,
      elapsed: Date.now() - startTime,
    };
  };

  // ---------------------------------------------------------------------------
  // dispatch_agent tool — registered once at module load time so it is always
  // available regardless of how many times before_agent_start fires.
  // The execute function closes over currentMembers (a live module-level ref)
  // so it always sees the current team selection at call time.
  // ---------------------------------------------------------------------------
  pi.registerTool({
    name: 'dispatch_agent',
    label: 'Dispatch Agent',
    description: `Dispatch one or more agents. Each entry has { agent, task, dependsOn? }. Agents with no dependsOn run immediately in parallel. Agents with dependsOn wait for those agents to finish and receive their outputs as context. Available agents: ${currentMembers.join(', ')}.`,
    renderCall(args, theme) {
      const runs = Array.isArray(args.agents) ? args.agents : [];
      let text =
        theme.fg('toolTitle', theme.bold('dispatch_agent ')) +
        theme.fg(
          'accent',
          `${runs.length} agent${runs.length === 1 ? '' : 's'}`,
        );
      for (const run of runs.slice(0, 4)) {
        const agent =
          typeof run?.agent === 'string' && run.agent.trim()
            ? run.agent.trim()
            : 'unknown';
        const task =
          typeof run?.task === 'string' && run.task.trim()
            ? run.task.trim()
            : '(no task)';
        const preview = task.length > 56 ? `${task.slice(0, 56)}...` : task;
        text += `\n  ${theme.fg('accent', agent)} ${theme.fg('dim', preview)}`;
      }
      if (runs.length > 4) {
        text += `\n  ${theme.fg('muted', `... +${runs.length - 4} more`)}`;
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, options, theme) {
      return renderDispatchResult(result, options, theme);
    },
    parameters: Type.Object({
      agents: Type.Array(
        Type.Object({
          agent: Type.String({
            description: `Agent name. Must be one of: ${currentMembers.join(', ')}`,
          }),
          task: Type.String({
            description:
              'The specific task for this agent. Be clear and focused.',
          }),
          dependsOn: Type.Optional(
            Type.Array(Type.String(), {
              description:
                "Agent names that must complete before this agent starts. Their outputs will be injected into this agent's task as context. Omit or leave empty to run in parallel.",
            }),
          ),
        }),
        {
          description:
            'List of agents to dispatch. Agents without dependsOn run in parallel immediately. Agents with dependsOn wait for their dependencies.',
        },
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { agents } = params;
      const runDetails = new Map<string, DispatchRunDetails>(
        agents.map(({ agent, task, dependsOn }) => [
          agent,
          {
            agent,
            task,
            dependsOn: dependsOn ?? [],
            status: 'pending',
          },
        ]),
      );
      const getDetails = (
        status: DispatchToolDetails['status'],
      ): DispatchToolDetails => ({
        status,
        runs: agents.map(({ agent }) => ({
          ...runDetails.get(agent)!,
        })),
      });

      const emitUpdate = (status: DispatchToolDetails['status']) => {
        _onUpdate?.({
          content: [
            {
              type: 'text',
              text: `Dispatch progress: ${agents
                .map(({ agent }) => {
                  const run = runDetails.get(agent)!;
                  return `${agent}=${run.status}`;
                })
                .join(', ')}`,
            },
          ],
          details: getDetails(status),
        });
      };

      // Fix 8: Build a Set once for O(1) membership checks in the validation
      // loop, replacing the O(N) currentMembers.includes(agent) linear scan.
      const currentMembersSet = new Set(currentMembers);

      // Validate all agent names and dependency references up front
      const allAgentNames = new Set(agents.map((a) => a.agent));
      for (const { agent, dependsOn } of agents) {
        if (!currentMembersSet.has(agent)) {
          return {
            content: [
              {
                type: 'text',
                text: `Unknown agent: "${agent}". Available: ${currentMembers.join(', ')}`,
              },
            ],
            details: getDetails('error'),
          };
        }
        for (const dep of dependsOn ?? []) {
          if (!allAgentNames.has(dep)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Agent "${agent}" has unknown dependency "${dep}". Must be one of: ${[...allAgentNames].join(', ')}`,
                },
              ],
              details: getDetails('error'),
            };
          }
        }
      }

      // Fix 6: Topologically sort agents so that every dependency always appears
      // before its dependent in the promise-building loop below. Without this,
      // if a dependent appears first in the input array, outputMap.get(dep)
      // returns undefined and `await undefined` resolves immediately — silently
      // skipping the dependency. The sort uses a simple iterative algorithm:
      // repeatedly move agents whose dependencies are all resolved into the
      // sorted list. If a full pass makes no progress, a cycle exists.
      const sortedAgents = (() => {
        const sorted: typeof agents = [];
        const resolved = new Set<string>();
        let remaining = [...agents];

        while (remaining.length > 0) {
          const prevLength = remaining.length;
          const next: typeof agents = [];

          for (const entry of remaining) {
            const deps = entry.dependsOn ?? [];
            if (deps.every((dep) => resolved.has(dep))) {
              sorted.push(entry);
              resolved.add(entry.agent);
            } else {
              next.push(entry);
            }
          }

          if (next.length === prevLength) {
            // No progress in a full pass — dependency cycle detected.
            return {
              kind: 'error' as const,
              error: `Cycle detected in dependsOn graph. Involved agents: ${next.map((e) => e.agent).join(', ')}`,
            };
          }
          remaining = next;
        }

        return { kind: 'ok' as const, sorted };
      })();

      if (sortedAgents.kind === 'error') {
        return {
          content: [{ type: 'text', text: sortedAgents.error }],
          details: getDetails('error'),
        };
      }

      const { sorted } = sortedAgents;

      // Build a promise map upfront — agents without deps start immediately,
      // agents with deps await their dependencies then receive outputs as context.
      // Fix 6: iterate over topologically sorted list so outputMap always has
      // a resolved promise for every dependency before a dependent reads it.
      const outputMap = new Map<string, Promise<string>>();

      for (const { agent, task, dependsOn } of sorted) {
        const promise = (async (): Promise<string> => {
          // Wait for all dependencies and collect their outputs
          let enrichedTask = task;
          if (dependsOn && dependsOn.length > 0) {
            const depOutputs = await Promise.all(
              dependsOn.map(async (dep) => {
                const depOutput = await outputMap.get(dep)!;
                return `## Output from ${dep}:\n${depOutput}`;
              }),
            );
            enrichedTask = `${task}\n\n---\n## Context from upstream agents:\n${depOutputs.join('\n\n')}`;
          }

          try {
            // Fix 7: Defer the 'starting' event via queueMicrotask so the
            // event loop can yield to I/O (giving the subprocess time to
            // actually start) before the notification fires. All _onUpdate
            // calls remain optional-chained as required.
            queueMicrotask(() => {
              runDetails.set(agent, {
                ...runDetails.get(agent)!,
                status: 'starting',
              });
              emitUpdate('running');
            });

            // Fix 4: removed setWidget call — mutating dispatchedAgents is
            // sufficient; the registered widget reads from the shared Set.
            dispatchedAgents.add(agent);

            const rawResult = await dispatchAgent(
              agent,
              enrichedTask,
              _ctx,
              _signal,
              _onUpdate,
            );
            const status = rawResult.exitCode === 0 ? 'done' : 'error';
            const summary = `[${agent}] ${status} in ${Math.round(rawResult.elapsed / 1000)}s (exit: ${rawResult.exitCode})`;
            const displayOutput =
              rawResult.output.length > 8000
                ? rawResult.output.slice(0, 8000) + '\n\n... [truncated]'
                : rawResult.output;

            const formattedResult = `${summary}\n\n${displayOutput}`;

            runDetails.set(agent, {
              ...runDetails.get(agent)!,
              status: rawResult.exitCode === 0 ? 'done' : 'error',
              output: formattedResult,
              exitCode: rawResult.exitCode,
              elapsed: rawResult.elapsed,
            });
            emitUpdate(
              rawResult.exitCode === 0 &&
                [...runDetails.values()].every(
                  (run) => run.status === 'done' || run.status === 'error',
                )
                ? [...runDetails.values()].some((run) => run.status === 'error')
                  ? 'error'
                  : 'done'
                : 'running',
            );

            return formattedResult;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            runDetails.set(agent, {
              ...runDetails.get(agent)!,
              status: 'error',
              output: `[${agent}] error: ${msg}`,
            });
            emitUpdate('running');
            return `[${agent}] error: ${msg}`;
          } finally {
            // Fix 4: removed setWidget call here too.
            dispatchedAgents.delete(agent);
          }
        })();

        outputMap.set(agent, promise);
      }

      // Wait for all agents to finish
      const results = await Promise.all([...outputMap.values()]);

      const finalStatus = [...runDetails.values()].some(
        (run) => run.status === 'error',
      )
        ? 'error'
        : 'done';

      return {
        content: [{ type: 'text', text: results.join('\n\n---\n\n') }],
        details: getDetails(finalStatus),
      };
    },
  });

  pi.on('session_start', async (_event, ctx) => {
    syncSessionModel(ctx.model);

    // Fix 1: use already-cached teams; if cache is stale, refresh first.
    refreshCache();
    const teams = cachedTeams;
    const teamNames = Object.keys(teams);

    if (!selectedTeam || !teams[selectedTeam]) {
      selectedTeam = teamNames[0] ?? null;
    }
    currentMembers = selectedTeam ? (teams[selectedTeam] ?? []) : [];

    ctx.ui.setWidget('agent-dashboard', dashboardWidget(), {
      placement: 'aboveEditor',
    });
  });

  pi.on('model_select', (event) => {
    syncSessionModel(event.model);
  });

  pi.on('session_switch', (_event, ctx) => {
    syncSessionModel(ctx.model);
  });
}
