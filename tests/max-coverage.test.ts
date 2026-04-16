import test from 'node:test';
import assert from 'node:assert/strict';

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import maxCoverage, {
  hasMeaningfulSearchPattern,
  isMeaningfulRepoWideDiscoveryCall,
  isRepoWidePath,
  normalizeToolPath,
} from '../.pi/extensions/max-coverage.ts';

test('normalizeToolPath trims strings and ignores non-strings', () => {
  assert.equal(normalizeToolPath(' ./src '), './src');
  assert.equal(normalizeToolPath(undefined), '');
});

test('isRepoWidePath recognizes repository-root variants', () => {
  const rootDir = '/repo';

  assert.equal(isRepoWidePath(undefined, rootDir), true);
  assert.equal(isRepoWidePath('.', rootDir), true);
  assert.equal(isRepoWidePath('./', rootDir), true);
  assert.equal(isRepoWidePath('/repo', rootDir), true);
  assert.equal(isRepoWidePath('./src', rootDir), false);
});

test('meaningful repo-wide discovery requires a root-scoped find/grep with a pattern', () => {
  const rootDir = '/repo';

  assert.equal(hasMeaningfulSearchPattern('*.ts'), true);
  assert.equal(hasMeaningfulSearchPattern('   '), false);
  assert.equal(
    isMeaningfulRepoWideDiscoveryCall(
      { toolName: 'find', input: { pattern: '*.ts', path: '.' } } as never,
      rootDir,
    ),
    true,
  );
  assert.equal(
    isMeaningfulRepoWideDiscoveryCall(
      { toolName: 'grep', input: { pattern: 'todo', path: '/repo' } } as never,
      rootDir,
    ),
    true,
  );
  assert.equal(
    isMeaningfulRepoWideDiscoveryCall(
      { toolName: 'ls', input: { path: '.' } } as never,
      rootDir,
    ),
    false,
  );
  assert.equal(
    isMeaningfulRepoWideDiscoveryCall(
      { toolName: 'find', input: { pattern: '*.ts', path: './src' } } as never,
      rootDir,
    ),
    false,
  );
});

test('post-hook nudges persist until meaningful coverage is observed, then reset on new user input', async () => {
  const handlers = new Map<string, (event: unknown) => unknown>();
  const sentMessages: Array<{
    message: { customType: string; content: string; display: boolean };
    options: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' };
  }> = [];

  maxCoverage({
    on(
      event: Parameters<ExtensionAPI['on']>[0],
      handler: Parameters<ExtensionAPI['on']>[1],
    ) {
      handlers.set(event, handler as (event: unknown) => unknown);
    },
    sendMessage(
      message: Parameters<ExtensionAPI['sendMessage']>[0],
      options?: Parameters<ExtensionAPI['sendMessage']>[1],
    ) {
      sentMessages.push({
        message: message as { customType: string; content: string; display: boolean },
        options: (options ?? {}) as {
          triggerTurn?: boolean;
          deliverAs?: 'steer' | 'followUp' | 'nextTurn';
        },
      });
    },
  } as never);

  handlers.get('input')?.({ type: 'input', text: 'fix it', source: 'interactive' });
  handlers.get('turn_end')?.({ type: 'turn_end' });
  handlers.get('turn_end')?.({ type: 'turn_end' });

  assert.equal(sentMessages.length, 2);
  assert.deepEqual(sentMessages[0]?.options, {
    triggerTurn: true,
    deliverAs: 'steer',
  });

  handlers.get('tool_call')?.({
    toolCallId: 'ls-1',
    toolName: 'ls',
    input: { path: '.' },
  });
  handlers.get('turn_end')?.({ type: 'turn_end' });
  assert.equal(sentMessages.length, 3, 'trivial root ls should not satisfy coverage');

  handlers.get('tool_call')?.({
    toolCallId: 'find-1',
    toolName: 'find',
    input: { pattern: '*.ts', path: '.' },
  });
  handlers.get('turn_end')?.({ type: 'turn_end' });
  assert.equal(
    sentMessages.length,
    4,
    'meaningful repo-wide find should not satisfy coverage until it succeeds',
  );

  handlers.get('tool_result')?.({
    type: 'tool_result',
    toolCallId: 'find-1',
    toolName: 'find',
    input: { pattern: '*.ts', path: '.' },
    content: [{ type: 'text', text: 'src/index.ts' }],
    details: undefined,
    isError: false,
  });
  handlers.get('turn_end')?.({ type: 'turn_end' });
  assert.equal(sentMessages.length, 4, 'successful repo-wide find should satisfy coverage');

  handlers.get('input')?.({ type: 'input', text: 'new task', source: 'interactive' });
  handlers.get('turn_end')?.({ type: 'turn_end' });
  assert.equal(sentMessages.length, 5, 'new user input should require coverage again');
});

test('failed meaningful discovery does not satisfy coverage', () => {
  const handlers = new Map<string, (event: unknown) => unknown>();
  const sentMessages: Array<{ customType: string }> = [];

  maxCoverage({
    on(
      event: Parameters<ExtensionAPI['on']>[0],
      handler: Parameters<ExtensionAPI['on']>[1],
    ) {
      handlers.set(event, handler as (event: unknown) => unknown);
    },
    sendMessage(message: Parameters<ExtensionAPI['sendMessage']>[0]) {
      sentMessages.push(message as { customType: string });
    },
  } as never);

  handlers.get('input')?.({ type: 'input', text: 'inspect repo', source: 'interactive' });
  handlers.get('tool_call')?.({
    toolCallId: 'find-fail',
    toolName: 'find',
    input: { pattern: '*.ts', path: '.' },
  });
  handlers.get('tool_result')?.({
    type: 'tool_result',
    toolCallId: 'find-fail',
    toolName: 'find',
    input: { pattern: '*.ts', path: '.' },
    content: [{ type: 'text', text: 'fd failed' }],
    details: undefined,
    isError: true,
  });
  handlers.get('turn_end')?.({ type: 'turn_end' });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0]?.customType, 'max-coverage');
});
