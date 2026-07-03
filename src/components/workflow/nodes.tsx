import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeKind, SummaryChip } from './nodeCatalog.ts';

export type WorkflowRunState = 'idle' | 'running' | 'ok' | 'fail' | 'would-run';

interface WorkflowNodeData {
  kind: NodeKind;
  label: string;
  icon?: string;
  chips?: SummaryChip[];
  destructive?: boolean;
  runState?: WorkflowRunState;
  selected?: boolean;
  [key: string]: unknown;
}

const RUN_LABELS: Record<WorkflowRunState, string> = {
  idle: 'Idle',
  running: 'Running',
  ok: 'OK',
  fail: 'Failed',
  'would-run': 'Would run',
};

function Icon({ name }: { name?: string }) {
  const paths: Record<string, React.ReactNode> = {
    'folder-plus': <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM17 11v5M14.5 13.5h5" />,
    'folder-open': <path d="M3 8h6l2 2h9l-2 8H4zM4 8v10" />,
    filter: <path d="M4 5h16l-6 7v5l-4 2v-7z" />,
    gauge: <path d="M5 15a7 7 0 0 1 14 0M12 15l4-5M8 18h8" />,
    clock: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v5l3 2" />,
    terminal: <path d="M4 5h16v14H4zM7 9l3 3-3 3M12 15h5" />,
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
    image: <path d="M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5M8 8h.01" />,
    move: <path d="M5 12h14M13 6l6 6-6 6" />,
    bell: <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" />,
    shield: <path d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z" />,
    nodes: <path d="M7 7h.01M17 6h.01M12 17h.01M8 8l3 7M16 8l-3 7M9 7h6" />,
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        {paths[name || 'spark'] || paths.spark}
      </g>
    </svg>
  );
}

function Shell({
  data,
  badge,
  children,
}: {
  data: WorkflowNodeData;
  badge: string;
  children?: React.ReactNode;
}) {
  const runState = data.runState || 'idle';
  const chips = data.chips || [];
  const classes = [
    'wf-node',
    `wf-node-${data.kind}`,
    `is-${runState}`,
    data.destructive ? 'wf-node-danger' : '',
    data.selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-testid={`wf-node-${data.kind}`}>
      <div className="wf-node-run" title={RUN_LABELS[runState]} />
      <div className="wf-node-head">
        <span className="wf-node-icon">
          <Icon name={data.icon} />
        </span>
        <span className="wf-node-title">{data.label}</span>
        <span className="wf-node-badge">{badge}</span>
      </div>
      <div className="wf-node-chips">
        {chips.map((chip) => (
          <span className={chip.empty ? 'is-empty' : ''} key={chip.label}>
            <b>{chip.label}</b>
            {chip.value}
          </span>
        ))}
      </div>
      {data.destructive ? <div className="wf-node-danger-pill">需確認 · review</div> : null}
      {children}
    </div>
  );
}

export function TriggerNode({ data, selected }: NodeProps) {
  return (
    <Shell data={{ ...(data as WorkflowNodeData), selected }} badge="TRIGGER">
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function ConditionNode({ data, selected }: NodeProps) {
  return (
    <Shell data={{ ...(data as WorkflowNodeData), selected }} badge="IF">
      <Handle type="target" position={Position.Left} />
      <Handle className="wf-handle-true" id="true" type="source" position={Position.Right} />
      <Handle className="wf-handle-false" id="false" type="source" position={Position.Bottom} />
      <span className="wf-branch-label wf-branch-true">YES</span>
      <span className="wf-branch-label wf-branch-false">NO</span>
    </Shell>
  );
}

export function ActionNode({ data, selected }: NodeProps) {
  return (
    <Shell data={{ ...(data as WorkflowNodeData), selected }} badge="DO">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export const workflowNodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
};
