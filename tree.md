# Codebase Structure

```text
.
├── AGENTS.md
├── bun.lock
├── LICENSE
├── package.json
├── README.md
├── tsconfig.json
├── .pi/
│   ├── APPEND_SYSTEM.md
│   ├── SYSTEM.md
│   ├── extensions/
│   │   ├── permission-gate.ts
│   │   ├── protected-paths.ts
│   │   ├── subagent.ts
│   │   ├── task-mode.ts
│   │   ├── theme-cycle.ts
│   │   └── tilldone.ts
│   ├── lib/
│   │   ├── permission-policy.ts
│   │   ├── protected-paths.ts
│   │   ├── subagent.ts
│   │   ├── theme-cycle.ts
│   │   └── tilldone.ts
│   ├── prompts/
│   │   ├── prime.md
│   │   └── review.md
│   ├── skills/
│   │   ├── repo-review/
│   │   │   └── SKILL.md
│   │   └── ship-task/
│   │       └── SKILL.md
│   └── themes/
│       ├── black.json
│       ├── cyan.json
│       ├── default.json
│       ├── green.json
│       ├── orange.json
│       ├── purple.json
│       └── white.json
└── tests/
    ├── permission-policy.test.ts
    ├── protected-paths.test.ts
    ├── subagent.test.ts
    ├── task-mode.test.ts
    └── theme-cycle.test.ts
```
