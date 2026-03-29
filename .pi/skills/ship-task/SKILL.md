---
name: ship-task
description: Implements a scoped repository change end to end with minimal edits and focused verification. Use when asked to build, fix, add, or finish a concrete task.
---

# Ship Task

Use this skill when the task is to implement a change end to end.

Workflow:

1. Read `.pi/prompts/prime.md`.
2. Inspect the current implementation before editing.
3. Check `.pi/extensions/` if the task may cross protected paths or require policy decisions.
4. Make the smallest complete change.
5. Verify with a focused command or test.

Outputs:

- Short summary of what changed.
- Verification result.
- Any remaining risk or follow-up.
