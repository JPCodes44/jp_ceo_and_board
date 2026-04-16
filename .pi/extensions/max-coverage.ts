import path from 'node:path';
import type {
  ExtensionAPI,
  InputEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@mariozechner/pi-coding-agent';

const ROOT_TOKENS = new Set(['', '.', './']);
const COVERAGE_NUDGE =
  'Before you conclude, do one meaningful repo-wide discovery pass from the repository root so your answer reflects the codebase, not just the first matching file. Prefer root-scoped find/grep to map the relevant implementation areas, then inspect only the files needed to finish the task.';

export function normalizeToolPath(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isRepoWidePath(value: unknown, rootDir: string): boolean {
  const normalized = normalizeToolPath(value);
  if (ROOT_TOKENS.has(normalized)) {
    return true;
  }

  if (!normalized) {
    return true;
  }

  const absolutePath = path.resolve(rootDir, normalized);
  return absolutePath === rootDir;
}

export function hasMeaningfulSearchPattern(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isMeaningfulRepoWideDiscoveryCall(
  event: Pick<ToolCallEvent, 'toolName' | 'input'>,
  rootDir: string,
): boolean {
  if (!isRepoWidePath((event.input as { path?: unknown }).path, rootDir)) {
    return false;
  }

  switch (event.toolName) {
    case 'find':
    case 'grep':
      return hasMeaningfulSearchPattern(
        (event.input as { pattern?: unknown }).pattern,
      );
    default:
      return false;
  }
}

export default function maxCoverage(pi: ExtensionAPI) {
  const rootDir = process.cwd();
  let coverageSatisfied = false;
  const pendingDiscoveryCallIds = new Set<string>();

  pi.on('input', (event: InputEvent) => {
    if (event.source !== 'extension') {
      coverageSatisfied = false;
      pendingDiscoveryCallIds.clear();
    }
  });

  pi.on('before_agent_start', (event) => {
    return {
      systemPrompt: `${event.systemPrompt}

## Max Coverage Mode
- Start with one meaningful repo-wide discovery pass from the repository root before narrowing in.
- Prefer root-scoped find/grep to identify the implementation areas relevant to the task.
- Do not treat a trivial root listing as sufficient coverage.
- After that pass, inspect only the files needed to complete the task.
- Treat .pi as orchestration config: inspect it only when relevant and avoid unrelated writes there.`,
    };
  });

  pi.on('tool_call', (event) => {
    if (isMeaningfulRepoWideDiscoveryCall(event, rootDir)) {
      pendingDiscoveryCallIds.add(event.toolCallId);
    }
  });

  pi.on('tool_result', (event: ToolResultEvent) => {
    if (!pendingDiscoveryCallIds.has(event.toolCallId)) {
      return;
    }

    pendingDiscoveryCallIds.delete(event.toolCallId);
    if (!event.isError) {
      coverageSatisfied = true;
    }
  });

  pi.on('turn_end', () => {
    if (coverageSatisfied) {
      return;
    }

    pi.sendMessage(
      {
        customType: 'max-coverage',
        content: COVERAGE_NUDGE,
        display: false,
      },
      {
        triggerTurn: true,
        deliverAs: 'steer',
      },
    );
  });
}
