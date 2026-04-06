import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignTaskToAgentTeam,
  createAgentRoutingInstruction,
  detectExplicitAgentRole,
  detectRequestedAgentRoles,
  formatAgentUsage,
  getAgentTeamStateSnapshot,
  parseAgentTeamsConfig,
  resolveAgentRoleInput,
  resolveAgentTeamSubagentRoute,
  resetAgentTeamRuntimeState,
  routeTextToAgentRole,
  setActiveAgentTeam,
  setAgentTeamMemberModels,
  startAgentTeamRun,
  finishAgentTeamRun,
  updateAgentTeamRun,
} from '../.pi/lib/agent-team.ts';

test('detectExplicitAgentRole honors explicit team member requests', () => {
  assert.equal(
    detectExplicitAgentRole('use the reviewer for this'),
    'Reviewer',
  );
  assert.equal(
    detectExplicitAgentRole('builder should do this change'),
    'Builder',
  );
  assert.equal(
    detectExplicitAgentRole('delegate this to red team'),
    'Red Team',
  );
});

test('routeTextToAgentRole picks the best matching team member', () => {
  assert.deepEqual(
    routeTextToAgentRole('find the auth flow and map the main files'),
    {
      role: 'Scout',
      profile: 'scout',
      explicit: false,
      reason: 'Matched scout keywords in the latest request.',
    },
  );

  assert.deepEqual(
    routeTextToAgentRole('document the API and update the readme'),
    {
      role: 'Documenter',
      profile: 'documenter',
      explicit: false,
      reason: 'Matched documenter keywords in the latest request.',
    },
  );
});

test('routeTextToAgentRole respects the active team roster', () => {
  assert.deepEqual(
    routeTextToAgentRole('what should we do next', ['Planner', 'Builder']),
    {
      role: 'Planner',
      profile: 'planner',
      explicit: false,
      reason: 'Defaulted to Planner for a general request.',
    },
  );

  assert.deepEqual(
    routeTextToAgentRole('use the reviewer for this', ['Builder']),
    {
      role: 'Builder',
      profile: 'worker',
      explicit: false,
      reason:
        'Reviewer is not part of the active team, so routing used the current team roster.',
    },
  );
});

test('parseAgentTeamsConfig supports inline and multiline team definitions', () => {
  assert.deepEqual(
    parseAgentTeamsConfig(`teams:
  delivery: [planner, worker, reviewer]
  docs:
    - planner
    - docs
`),
    [
      { name: 'delivery', roles: ['Planner', 'Builder', 'Reviewer'] },
      { name: 'docs', roles: ['Planner', 'Documenter'] },
    ],
  );
});

test('setActiveAgentTeam and setAgentTeamMemberModels update the active team', () => {
  resetAgentTeamRuntimeState();
  setActiveAgentTeam('delivery', ['Planner', 'Builder', 'Reviewer']);
  setAgentTeamMemberModels(
    ['Planner', 'Builder', 'Reviewer'],
    'gemini-2.5-pro',
  );

  const state = getAgentTeamStateSnapshot();
  assert.equal(state.activeTeamName, 'delivery');
  assert.deepEqual(state.activeRoles, ['Planner', 'Builder', 'Reviewer']);
  assert.equal(state.members.Planner.model, 'gemini-2.5-pro');
  assert.equal(state.members.Builder.model, 'gemini-2.5-pro');
  assert.equal(state.members.Reviewer.model, 'gemini-2.5-pro');
  assert.equal(state.members.Scout.model, 'gemini-3-flash');
});

test('assignTaskToAgentTeam marks the selected member as assigned', () => {
  resetAgentTeamRuntimeState();
  const decision = routeTextToAgentRole(
    'use the reviewer to audit this change',
  );
  assignTaskToAgentTeam('use the reviewer to audit this change', decision);

  const state = getAgentTeamStateSnapshot();
  assert.equal(state.members.Reviewer.status, 'assigned');
  assert.equal(
    state.members.Reviewer.lastTask,
    'use the reviewer to audit this change',
  );
  assert.equal(state.latestRoute?.role, 'Reviewer');
  assert.equal(state.latestRoute?.explicit, true);
});

test('detectRequestedAgentRoles finds multiple explicit agents and full-team broadcasts', () => {
  assert.deepEqual(
    detectRequestedAgentRoles('ask the builder and reviewer to handle this'),
    ['Builder', 'Reviewer'],
  );
  assert.deepEqual(
    detectRequestedAgentRoles('hey scout and planner look thruy hte codebase'),
    ['Scout', 'Planner'],
  );
  assert.deepEqual(detectRequestedAgentRoles('run the agent team on this'), [
    'Scout',
    'Planner',
    'Builder',
    'Reviewer',
    'Documenter',
    'Red Team',
  ]);
});

test('assignTaskToAgentTeam keeps multiple requested members assigned', () => {
  resetAgentTeamRuntimeState();
  const decision = routeTextToAgentRole(
    'ask the builder and reviewer to handle this',
  );
  assignTaskToAgentTeam(
    'ask the builder and reviewer to handle this',
    decision,
    {
      requestedRoles: ['Builder', 'Reviewer'],
    },
  );

  const state = getAgentTeamStateSnapshot();
  assert.equal(state.members.Builder.status, 'assigned');
  assert.equal(state.members.Reviewer.status, 'assigned');
  assert.deepEqual(state.latestRequestedRoles, ['Builder', 'Reviewer']);
});

test('resolveAgentTeamSubagentRoute rotates through requested team members', () => {
  resetAgentTeamRuntimeState();
  const decision = routeTextToAgentRole(
    'ask the builder and reviewer to handle this',
  );
  assignTaskToAgentTeam(
    'ask the builder and reviewer to handle this',
    decision,
    {
      requestedRoles: ['Builder', 'Reviewer'],
    },
  );

  const first = resolveAgentTeamSubagentRoute(
    undefined,
    'ask the builder and reviewer to handle this',
  );
  assert.equal(first.role, 'Builder');
  assert.equal(first.profile, 'worker');

  assignTaskToAgentTeam('ask the builder and reviewer to handle this', first, {
    preserveRequestedRoles: true,
  });
  const second = resolveAgentTeamSubagentRoute(
    undefined,
    'ask the builder and reviewer to handle this',
  );
  assert.equal(second.role, 'Reviewer');
  assert.equal(second.profile, 'reviewer');
});

test('team runtime tracks usage and completion', () => {
  resetAgentTeamRuntimeState();
  startAgentTeamRun({
    role: 'Builder',
    task: 'fix the failing tests',
    runId: 7,
    progress: 20,
  });
  finishAgentTeamRun({
    role: 'Builder',
    task: 'fix the failing tests',
    runId: 7,
    status: 'done',
    durationMs: 65_000,
    usage: {
      turns: 2,
      input: 1200,
      output: 300,
      contextTokens: 1500,
    },
    output: 'Finished patch and verification.',
  });

  const state = getAgentTeamStateSnapshot();
  assert.equal(state.members.Builder.status, 'done');
  assert.equal(state.members.Builder.progress, 100);
  assert.match(state.members.Builder.usageLabel ?? '', /2t/);
  assert.match(state.members.Builder.usageLabel ?? '', /ctx:1\.5k/);
});

test('team runtime captures thinking blurbs and full logs', () => {
  resetAgentTeamRuntimeState();
  startAgentTeamRun({
    role: 'Planner',
    task: 'plan the rollout',
    runId: 9,
    progress: 15,
    thinkingLevel: 'high',
  });
  updateAgentTeamRun({
    role: 'Planner',
    task: 'plan the rollout',
    runId: 9,
    thinkingLog: 'First pass on tradeoffs\n',
    appendThinkingLog: true,
  });
  updateAgentTeamRun({
    role: 'Planner',
    task: 'plan the rollout',
    runId: 9,
    thinkingLog: 'Second pass on sequencing',
    appendThinkingLog: true,
  });

  const state = getAgentTeamStateSnapshot();
  assert.equal(state.members.Planner.thinkingLevel, 'high');
  assert.equal(state.members.Planner.thinkingBlurb, 'First pass on tradeoffs');
  assert.equal(
    state.members.Planner.thinkingLog,
    'First pass on tradeoffs\nSecond pass on sequencing',
  );
});

test('resolveAgentRoleInput accepts role aliases used by team commands', () => {
  assert.equal(resolveAgentRoleInput('reviewer'), 'Reviewer');
  assert.equal(resolveAgentRoleInput('red-team'), 'Red Team');
  assert.equal(resolveAgentRoleInput('docs'), 'Documenter');
});

test('routeTextToAgentRole respects direct multi-agent addressing', () => {
  assert.deepEqual(
    routeTextToAgentRole('hey scout and planner look thruy hte codebase'),
    {
      role: 'Scout',
      profile: 'scout',
      explicit: true,
      reason: 'User explicitly requested Scout.',
    },
  );
});

test('formatAgentUsage and routing instruction stay compact', () => {
  assert.equal(
    formatAgentUsage({
      turns: 1,
      input: 1200,
      output: 450,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 32000,
    }),
    '1t ↑1.2k ↓450 ctx:32k',
  );

  assert.match(
    createAgentRoutingInstruction('review this patch', {
      role: 'Reviewer',
      profile: 'reviewer',
      explicit: true,
      reason: 'User explicitly requested Reviewer.',
    }),
    /Selected member: Reviewer \(reviewer\)/,
  );

  assert.match(
    createAgentRoutingInstruction(
      'ask the builder and reviewer to handle this',
      {
        role: 'Builder',
        profile: 'worker',
        explicit: true,
        reason: 'User explicitly requested Builder.',
      },
      ['Builder', 'Reviewer'],
    ),
    /Requested members: Builder \(worker\), Reviewer \(reviewer\)/,
  );
});
