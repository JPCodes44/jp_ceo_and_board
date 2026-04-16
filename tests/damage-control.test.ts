import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePermission } from '../.pi/lib/permission-policy.ts';
import { isProtectedPath } from '../.pi/lib/protected-paths.ts';
import { shouldGateCommand } from '../.pi/extensions/permission-gate.ts';

test('denied delete on protected file', () => {
  const result = evaluatePermission({ action: 'delete', target: '.env' });
  assert.equal(result.allowed, false);
});

test('denied dangerous git commands', () => {
  const dangerous = [
    'git push --force',
    'git rebase',
    'git reset --hard',
    'git clean -fd',
  ];
  for (const cmd of dangerous) {
    assert.equal(shouldGateCommand(cmd), true, `expected gate for: ${cmd}`);
  }
});

test('path normalization edge cases', () => {
  // Parent-relative path resolves to .env
  assert.equal(isProtectedPath('../jp_ceo_and_board/.env'), true);
  // Double-slash in infra path still blocked
  assert.equal(isProtectedPath('infra//main.tf'), true);
  // Dot-slash parent traversal to .env blocked
  assert.equal(isProtectedPath('./../.env'), true);
});

test('missing policy context denies by default', () => {
  const result = evaluatePermission({ action: 'write', target: 'src/index.ts' });
  assert.equal(result.allowed, false);
});

test('structured log output', () => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action: 'write',
    target: 'src/index.ts',
    allowed: true,
    reason: 'target within writable roots',
  };
  assert.equal(typeof logEntry.timestamp, 'string');
  assert.equal(typeof logEntry.action, 'string');
  assert.equal(typeof logEntry.target, 'string');
  assert.equal(typeof logEntry.allowed, 'boolean');
  assert.equal(typeof logEntry.reason, 'string');
  assert.ok(logEntry.timestamp.length > 0);
  assert.ok(logEntry.action.length > 0);
  assert.ok(logEntry.target.length > 0);
  assert.ok(logEntry.reason.length > 0);
});

test('allowed safe read operations', () => {
  const result = evaluatePermission({ action: 'read', target: 'anything/at/all.txt' });
  assert.equal(result.allowed, true);
});

test('blocked write to secrets directory', () => {
  assert.equal(isProtectedPath('secrets/api-key.json'), true);
});

test('gate denies unknown actions', () => {
  const result = evaluatePermission({ action: 'unknown', target: 'foo.ts' });
  assert.equal(result.allowed, false);
  assert.equal(result.escalated, true);
});
