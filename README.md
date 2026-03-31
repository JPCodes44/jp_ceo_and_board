# jp_ceo_and_board
My AI multi agent orchestration with each agent having 1M+ context for whatever daily tasks I need.

## Prompt Infrastructure

This repo includes a repo-local `.pi/` scaffold for local agent behavior:

- `.pi/prompts/` stores reusable prompts for priming and review work.
- `.pi/skills/` stores lightweight workflow definitions.
- `.pi/extensions/` stores small TypeScript modules for protected paths, permission checks, task-mode helpers, and a lightweight subagent tool.
- `.pi/lib/` stores small shared helpers used by the extensions.

## Entry points

Use the pinned Pi launcher from `package.json`:

```bash
npm run pi
```

Useful local prompt, skill, and tool entry points:

- `/prime` loads `.pi/prompts/prime.md`
- `/review` loads `.pi/prompts/review.md`
- `/skill:ship-task` runs the scoped implementation workflow
- `/skill:repo-review` runs the defect-focused review workflow
- `/subagent <agent> <task>` runs a subagent in the background with a live status widget
  - supported agents: `general`, `scout`, `planner`, `reviewer`, `worker`, `documenter`, `red-team`
  - with no args, it defaults to a `general` run over the current repo
  - if the first argument is not a known profile, it is treated as general prompt text
  - `general` for broad repo help when you do not want a specialized mode
  - `scout` for codebase recon
  - `reviewer` for defect-focused review
  - `worker` for focused implementation, with `--write` only when needed
- the agent team dashboard auto-routes each user request to the best team member, shows a live thinking blurb for active team agents, and honors explicit member requests like "use the reviewer" or "builder should do this"
- `/team-model <role> <model-name>` changes the configured model shown for a team member
- `/team-model-all <model-name>` changes the configured model for every role in the active team roster
- `/team-select <team-name|all>` switches the active roster using `teams/agent-teams.yaml`; `all` restores the full default team
- `/team-agent-log <role>` shows the full captured thinking log for that team member
- `/update` reloads the active team roster from `teams/agent-teams.yaml` and refreshes available model completions
- `/subagent-kill` stops the currently running background subagent (`--force` sends SIGKILL, optional id like `/subagent-kill 4`)
- `/subrm` is a short alias for `/subagent-kill`; with no args it targets the top/current subagent
- `/tilldone-stop` stops the current automatic task sequence
- `Ctrl+X` cycles Pi through the local green → purple → cyan → orange → black → default → white themes
- `subagent` also exists as a callable tool for the main agent

After editing `.pi/`, reload resources in Pi with:

```bash
/reload
```

Team rosters for `/team-select` live in `teams/agent-teams.yaml` and use a lightweight YAML mapping, for example:

```yaml
teams:
  delivery: [planner, worker, reviewer]
  docs:
    - planner
    - documenter
```

## Files

```text
.
├─ AGENTS.md
├─ .pi/
│  ├─ SYSTEM.md
│  ├─ APPEND_SYSTEM.md
│  ├─ lib/
│  │  ├─ agent-team.ts
│  │  ├─ permission-policy.ts
│  │  ├─ protected-paths.ts
│  │  ├─ subagent.ts
│  │  ├─ theme-cycle.ts
│  │  └─ tilldone.ts
│  ├─ themes/
│  │  ├─ black.json
│  │  ├─ cyan.json
│  │  ├─ default.json
│  │  ├─ green.json
│  │  ├─ orange.json
│  │  ├─ purple.json
│  │  └─ white.json
│  ├─ prompts/
│  │  ├─ review.md
│  │  └─ prime.md
│  ├─ skills/
│  │  ├─ repo-review/
│  │  │  └─ SKILL.md
│  │  └─ ship-task/
│  │     └─ SKILL.md
│  └─ extensions/
│     ├─ agent-team.ts
│     ├─ protected-paths.ts
│     ├─ permission-gate.ts
│     ├─ subagent.ts
│     ├─ task-mode.ts
│     ├─ theme-cycle.ts
│     └─ tilldone.ts
├─ package.json
├─ tests/
└─ tsconfig.json
```

## Validation

Run:

```bash
npm run lint
npm run typecheck
npm test
```
