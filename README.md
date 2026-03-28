# jp_ceo_and_board
My AI multi agent orchestration with each agent having 1M+ context for whatever daily tasks I need.

## Prompt Infrastructure

This repo now includes a `.pi/` scaffold for local agent behavior:

- `.pi/prompts/` stores reusable prompts for priming and review work.
- `.pi/skills/` stores lightweight workflow definitions.
- `.pi/extensions/` stores small TypeScript modules for protected paths, permission checks, and task-mode routing.

## Files

```text
.
├─ AGENTS.md
├─ .pi/
│  ├─ SYSTEM.md
│  ├─ APPEND_SYSTEM.md
│  ├─ prompts/
│  │  ├─ review.md
│  │  └─ prime.md
│  ├─ skills/
│  │  ├─ repo-review/
│  │  │  └─ SKILL.md
│  │  └─ ship-task/
│  │     └─ SKILL.md
│  └─ extensions/
│     ├─ protected-paths.ts
│     ├─ permission-gate.ts
│     └─ task-mode.ts
├─ package.json
└─ tsconfig.json
```

## Validation

Run:

```bash
npm run typecheck
```
