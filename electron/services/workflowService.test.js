import { describe, it, expect } from 'vitest';
import workflow from './workflowService.js';

// These tests run against the real automationService (so the genuine `matches`
// predicate is exercised). The engine pushes one entry to `res.steps` for each
// action node it executes, so `res.steps.length` is the execution count — no spy
// needed. Non-dry-run cases use only side-effect-free actions (notify /
// cleanupReminder); the destructive `move` action is only used under dry-run.
const {
  runWorkflow,
  dryRunWorkflow,
  isDestructiveNode,
  migrateAutomationsToWorkflows,
  listWorkflows,
} = workflow;

function makeWorkflow(nodes, edges, overrides = {}) {
  return { id: 'wf1', name: 'Test', enabled: true, nodes, edges, ...overrides };
}

const triggerNode = { id: 't1', kind: 'trigger', type: 'newFileInFolder', config: {} };
const actionNode = (id, type, config = {}) => ({ id, kind: 'action', type, config });
const conditionNode = (id, type, value) => ({ id, kind: 'condition', type, config: { value } });

describe('runWorkflow', () => {
  it('runs trigger -> action on a file event', async () => {
    const wf = makeWorkflow(
      [triggerNode, actionNode('a1', 'notify')],
      [{ id: 'e1', source: 't1', target: 'a1' }],
    );
    const res = await runWorkflow(wf, { kind: 'file', info: { file: 'x.png', ext: '.png' } });
    expect(res.ok).toBe(true);
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0].type).toBe('notify');
  });

  it('prunes a branch when a condition node does not match', async () => {
    const wf = makeWorkflow(
      [triggerNode, conditionNode('c1', 'extension', '.pdf'), actionNode('a1', 'notify')],
      [
        { id: 'e1', source: 't1', target: 'c1' },
        { id: 'e2', source: 'c1', target: 'a1' },
      ],
    );
    // event ext is .png, condition wants .pdf -> action must NOT run
    const res = await runWorkflow(wf, { kind: 'file', info: { ext: '.png' } });
    expect(res.steps).toHaveLength(0);

    // matching ext -> action runs
    const res2 = await runWorkflow(wf, { kind: 'file', info: { ext: '.pdf' } });
    expect(res2.steps).toHaveLength(1);
  });

  it('routes condition true and false handles separately', async () => {
    const wf = makeWorkflow(
      [
        triggerNode,
        conditionNode('c1', 'extension', '.pdf'),
        actionNode('yes', 'notify'),
        actionNode('no', 'cleanupReminder'),
      ],
      [
        { id: 'e1', source: 't1', target: 'c1' },
        { id: 'e2', source: 'c1', sourceHandle: 'true', target: 'yes' },
        { id: 'e3', source: 'c1', sourceHandle: 'false', target: 'no' },
      ],
    );
    const yes = await runWorkflow(wf, { kind: 'file', info: { ext: '.pdf' } });
    expect(yes.steps.map((step) => step.nodeId)).toEqual(['yes']);
    const no = await runWorkflow(wf, { kind: 'file', info: { ext: '.png' } });
    expect(no.steps.map((step) => step.nodeId)).toEqual(['no']);
  });

  it('does not double-execute an action reachable by two paths', async () => {
    const wf = makeWorkflow(
      [
        triggerNode,
        conditionNode('c1', 'newFileInFolder'),
        conditionNode('c2', 'newFileInFolder'),
        actionNode('a1', 'notify'),
      ],
      [
        { id: 'e1', source: 't1', target: 'c1' },
        { id: 'e2', source: 't1', target: 'c2' },
        { id: 'e3', source: 'c1', target: 'a1' },
        { id: 'e4', source: 'c2', target: 'a1' },
      ],
    );
    const res = await runWorkflow(wf, { kind: 'file', info: {} });
    expect(res.steps).toHaveLength(1);
  });

  it('a manual run fires every trigger', async () => {
    const wf = makeWorkflow(
      [
        { id: 't1', kind: 'trigger', type: 'schedule', config: {} },
        actionNode('a1', 'cleanupReminder'),
      ],
      [{ id: 'e1', source: 't1', target: 'a1' }],
    );
    const res = await runWorkflow(wf, { kind: 'manual' });
    expect(res.steps).toHaveLength(1);
  });

  it('skips disabled workflows', async () => {
    const wf = makeWorkflow(
      [triggerNode, actionNode('a1', 'notify')],
      [{ id: 'e1', source: 't1', target: 'a1' }],
      { enabled: false },
    );
    const res = await runWorkflow(wf, { kind: 'manual' });
    expect(res.skipped).toBe('disabled');
  });

  it('reports no-trigger when the event matches nothing', async () => {
    const wf = makeWorkflow(
      [{ id: 't1', kind: 'trigger', type: 'schedule', config: {} }, actionNode('a1', 'notify')],
      [{ id: 'e1', source: 't1', target: 'a1' }],
    );
    // a file event should not fire a schedule-only trigger
    const res = await runWorkflow(wf, { kind: 'file', info: {} });
    expect(res.skipped).toBe('no-trigger');
  });
});

describe('dryRun guardrails', () => {
  it('records steps without executing actions', async () => {
    const wf = makeWorkflow(
      [triggerNode, actionNode('a1', 'move', { target: 'C:/x' })],
      [{ id: 'e1', source: 't1', target: 'a1' }],
    );
    const res = await dryRunWorkflow(wf, { kind: 'manual' });
    expect(res.dryRun).toBe(true);
    // A dry-run step carries dryRun:true and never an action result, proving the
    // destructive `move` was planned but not executed.
    expect(res.steps[0].dryRun).toBe(true);
    expect(res.steps[0].destructive).toBe(true);
    expect(res.steps[0].ran).toBeUndefined();
  });
});

describe('isDestructiveNode', () => {
  it('flags file-mutating actions and clears safe ones', () => {
    expect(isDestructiveNode(actionNode('a', 'move'))).toBe(true);
    expect(isDestructiveNode(actionNode('a', 'organizeFileByType'))).toBe(true);
    expect(isDestructiveNode(actionNode('a', 'runProgram'))).toBe(true);
    expect(isDestructiveNode(actionNode('a', 'notify'))).toBe(false);
    expect(isDestructiveNode(actionNode('a', 'cleanupReminder'))).toBe(false);
    expect(isDestructiveNode(triggerNode)).toBe(false);
  });
});

describe('legacy migration', () => {
  it('converts a flat rule into a trigger -> action graph', () => {
    const [wf] = migrateAutomationsToWorkflows([
      {
        id: 'r1',
        name: 'Sort PDFs',
        enabled: true,
        condition: { type: 'extension', value: '.pdf' },
        action: { type: 'move', target: 'C:/Docs' },
      },
    ]);
    expect(wf.id).toBe('r1');
    expect(wf.name).toBe('Sort PDFs');
    expect(wf.enabled).toBe(true);
    expect(wf.nodes).toHaveLength(2);
    const [trigger, action] = wf.nodes;
    expect(trigger.kind).toBe('trigger');
    expect(trigger.type).toBe('extension');
    expect(trigger.config.value).toBe('.pdf');
    expect(action.kind).toBe('action');
    expect(action.type).toBe('move');
    expect(action.config.target).toBe('C:/Docs');
    expect(wf.edges).toHaveLength(1);
    expect(wf.edges[0].source).toBe(trigger.id);
    expect(wf.edges[0].target).toBe(action.id);
  });

  it('listWorkflows migrates when only legacy automations exist', () => {
    const result = listWorkflows({
      automations: [{ id: 'r1', condition: { type: 'schedule' }, action: { type: 'notify' } }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].nodes).toHaveLength(2);
  });

  it('listWorkflows prefers existing workflows over legacy automations', () => {
    const existing = [{ id: 'w', name: 'kept', enabled: true, nodes: [], edges: [] }];
    const result = listWorkflows({ workflows: existing, automations: [{ id: 'r1' }] });
    expect(result).toBe(existing);
  });
});
