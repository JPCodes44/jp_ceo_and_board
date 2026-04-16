# Damage Control System

## What It Protects Against

The pre-hook damage control layer prevents three classes of harmful operations:

1. **Destructive operations** — file deletions, dangerous git commands (`push --force`, `rebase`, `reset --hard`, `clean -fd`)
2. **Out-of-scope writes** — writes to directories not listed in `writableRoots`
3. **Protected path modification** — any mutation of paths in the protected set (`.env`, `secrets/`, `infra/`, `.github/workflows/`, `deployment/`, `package-lock.json`)

## Policy Configuration

### Protected Paths

`DEFAULT_PROTECTED_PATHS` in `.pi/lib/protected-paths.ts` defines the set of blocked paths:

```ts
// Default set
'.github/workflows/',
'infra/',
'deployment/',
'.env',
'secrets/',
'package-lock.json'
```

To add or remove a path, edit the `DEFAULT_PROTECTED_PATHS` array directly.

### Writable Roots

The `writableRoots` option restricts where write operations are allowed. When omitted, **all writes are denied by default**. Typical configuration:

```ts
evaluatePermission({
  action: 'write',
  target: 'src/index.ts',
  writableRoots: ['src/', 'tests/', 'docs/']
});
```

### Allow Delete

The `allowDelete` flag (default `false`) controls whether delete operations are ever permitted.

## How Failures Surface

Every permission evaluation returns a structured response:

```ts
{
  allowed: boolean;   // whether the operation may proceed
  escalated: boolean; // whether the denial requires human review
  reason: string;     // human-readable explanation
}
```

- `allowed: false` blocks the operation.
- `escalated: true` flags the denial for human attention (unknown actions, ambiguous targets).

## Example Log Entry

```json
{
  "timestamp": "2026-04-16T12:00:00.000Z",
  "action": "write",
  "target": "secrets/api-key.json",
  "allowed": false,
  "reason": "target matches protected path: secrets/"
}
```

## Blocked Git Commands

| Command | Reason |
|---|---|
| `git push --force` | Rewrites remote history |
| `git rebase` | Rewrites local history |
| `git reset --hard` | Discards uncommitted changes |
| `git clean -fd` | Deletes untracked files |

All detected by `shouldGateCommand()` in `.pi/extensions/permission-gate.ts`.

## Architecture

```
damage-control.ts (entry / pre-hook)
  ├── permission-policy.ts    — evaluatePermission(), createPermissionGate()
  │     └── protected-paths.ts — isProtectedPath(), DEFAULT_PROTECTED_PATHS
  └── permission-gate.ts      — shouldGateCommand() (shell command interception)
```

`damage-control.ts` is the orchestration layer invoked by the agent pre-hook. It delegates path checks to `protected-paths.ts`, action evaluation to `permission-policy.ts`, and command gating to `permission-gate.ts`.
