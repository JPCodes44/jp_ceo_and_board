import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { createPermissionGate } from '../lib/permission-policy.ts';
import { shouldGateCommand } from './permission-gate.ts';

export { createPermissionGate, shouldGateCommand };

export default function (pi: ExtensionAPI) {
  pi.on('before_agent_start', async (_ctx) => {
    const gate = createPermissionGate({
      root: process.cwd(),
      writableRoots: ['src', 'tests', 'docs'],
    });

    console.log(
      '[damage-control] active — permission gate wired for writable roots: src, tests, docs',
    );

    // Expose gate for other extensions via module-level export
    damageControlGate = gate;
  });
}

/** Gate instance created during before_agent_start; null until hook fires. */
export let damageControlGate: ReturnType<typeof createPermissionGate> | null = null;
