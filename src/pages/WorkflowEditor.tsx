import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../styles/workflow.css';
import Dialog from '../components/Dialog.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toggle from '../components/Toggle.jsx';
import { useLocale } from '../i18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { workflowNodeTypes, type WorkflowRunState } from '../components/workflow/nodes.tsx';
import {
  ACTION_TYPES,
  CONDITION_TYPES,
  TRIGGER_TYPES,
  catalogFor,
  fieldLabel,
  findDef,
  kindLabel,
  nodeDescription,
  nodeLabel,
  starterTemplates,
  summaryChips,
  type FieldDef,
  type NodeKind,
  type NodeTypeDef,
} from '../components/workflow/nodeCatalog.ts';

interface WorkflowNodeModel {
  id: string;
  kind: NodeKind;
  type: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

interface WorkflowEdgeModel {
  id: string;
  source: string;
  target: string;
}

interface WorkflowModel {
  id: string;
  name: string;
  enabled: boolean;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
}

interface WorkflowStep {
  nodeId?: string;
  type: string;
  ok?: boolean;
  error?: string;
  destructive?: boolean;
  dryRun?: boolean;
}

interface WorkflowRunResult {
  mode: 'dry-run' | 'run';
  ok?: boolean;
  skipped?: string;
  steps: WorkflowStep[];
}

interface WorkflowApi {
  workflows?: {
    list?: () => Promise<{ ok?: boolean; workflows?: WorkflowModel[] }>;
    save?: (workflows: WorkflowModel[]) => Promise<{ ok?: boolean; error?: string }>;
    run?: (id: string) => Promise<{ ok?: boolean; steps?: WorkflowStep[]; skipped?: string }>;
    dryRun?: (id: string) => Promise<{ ok?: boolean; steps?: WorkflowStep[]; skipped?: string }>;
    setEnabled?: (id: string, enabled: boolean) => Promise<{ ok?: boolean; error?: string }>;
  };
  pickPath?: (opts: { type: 'folder'; title?: string }) => Promise<{ ok?: boolean; path?: string }>;
}

type RFNode = Node<Record<string, unknown>>;

const uid = (prefix: string): string =>
  `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

const KIND_GROUPS: { kind: NodeKind; defs: NodeTypeDef[] }[] = [
  { kind: 'trigger', defs: TRIGGER_TYPES },
  { kind: 'condition', defs: CONDITION_TYPES },
  { kind: 'action', defs: ACTION_TYPES },
];

const KIND_COLORS: Record<NodeKind, string> = {
  trigger: '#22d3ee',
  condition: '#f59e0b',
  action: '#22c55e',
};

function edgeColor(kind?: NodeKind): string {
  return kind ? KIND_COLORS[kind] : '#22d3ee';
}

function edgeFor(edge: WorkflowEdgeModel, nodes: RFNode[]): Edge {
  const source = nodes.find((node) => node.id === edge.source);
  const color = edgeColor(source?.data.kind as NodeKind | undefined);
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: { stroke: color, strokeWidth: 2 },
  };
}

function toRfNode(
  node: WorkflowNodeModel,
  language: string,
  runState: WorkflowRunState = 'idle',
): RFNode {
  const def = findDef(node.kind, node.type);
  const config = node.config || {};
  return {
    id: node.id,
    type: node.kind,
    position: node.position || { x: 80, y: 80 },
    data: {
      kind: node.kind,
      nodeType: node.type,
      config,
      icon: def?.icon,
      label: nodeLabel(node.kind, node.type, language),
      description: nodeDescription(node.kind, node.type, language),
      chips: summaryChips(node.kind, node.type, config, language),
      destructive: node.kind === 'action' && !!def?.destructive,
      runState,
    },
  };
}

function toRf(wf: WorkflowModel, language: string): { nodes: RFNode[]; edges: Edge[] } {
  const rfNodes = (wf.nodes || []).map((node) => toRfNode(node, language));
  return {
    nodes: rfNodes,
    edges: (wf.edges || []).map((edge) => edgeFor(edge, rfNodes)),
  };
}

function fromRf(
  nodes: RFNode[],
  edges: Edge[],
): { nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: (node.data.kind as NodeKind) || 'action',
      type: (node.data.nodeType as string) || '',
      config: (node.data.config as Record<string, unknown>) || {},
      position: node.position,
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  };
}

function valueForInput(field: FieldDef, value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function normalizeFieldValue(field: FieldDef, value: string): unknown {
  if (value === '') return undefined;
  if (field.kind === 'number') return Number(value);
  return value;
}

function stepTone(step: WorkflowStep, mode: WorkflowRunResult['mode']) {
  if (mode === 'dry-run') return 'warn';
  if (step.ok === false) return 'danger';
  return 'ok';
}

export default function WorkflowEditor({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { language } = useLocale();
  const toastCtx = useToast() as { toast?: (message: string, type?: string) => void } | null;
  const notify = (message: string, type?: string) => toastCtx?.toast?.(message, type);
  const zh = language === 'zh';
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const localDirtyRef = useRef(false);

  const [workflows, setWorkflows] = useState<WorkflowModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [runOutput, setRunOutput] = useState<WorkflowRunResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const api = (typeof window !== 'undefined' ? (window as Window).api : undefined) as
    | WorkflowApi
    | undefined;

  const hydrateNodes = useCallback(
    (nextNodes: RFNode[]) =>
      nextNodes.map((node) => {
        const kind = node.data.kind as NodeKind;
        const type = node.data.nodeType as string;
        const config = (node.data.config as Record<string, unknown>) || {};
        const def = findDef(kind, type);
        return {
          ...node,
          data: {
            ...node.data,
            icon: def?.icon,
            label: nodeLabel(kind, type, language),
            description: nodeDescription(kind, type, language),
            chips: summaryChips(kind, type, config, language),
            destructive: kind === 'action' && !!def?.destructive,
          },
        };
      }),
    [language],
  );

  const selectWorkflow = useCallback(
    (wf: WorkflowModel) => {
      setSelectedId(wf.id);
      const rf = toRf(wf, language);
      setNodes(rf.nodes);
      setEdges(rf.edges);
      setSelectedNodeId(null);
      setRunOutput(null);
    },
    [language],
  );

  const load = useCallback(async () => {
    if (!api?.workflows?.list) return;
    const res = await api.workflows.list();
    if (localDirtyRef.current) return;
    if (res?.ok && Array.isArray(res.workflows)) {
      setWorkflows(res.workflows);
      if (res.workflows.length && !selectedId) selectWorkflow(res.workflows[0]);
    }
  }, [api?.workflows, selectWorkflow, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setNodes((current) => hydrateNodes(current));
  }, [hydrateNodes]);

  const selected = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedId) || null,
    [workflows, selectedId],
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const selectedDef = selectedNode
    ? findDef(selectedNode.data.kind as NodeKind, selectedNode.data.nodeType as string)
    : undefined;

  const filteredGroups = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return KIND_GROUPS.map((group) => ({
      ...group,
      defs: group.defs.filter((def) => {
        const haystack =
          `${def.label} ${def.labelEn} ${def.desc} ${def.descEn} ${def.type}`.toLowerCase();
        return !q || haystack.includes(q);
      }),
    })).filter((group) => group.defs.length);
  }, [paletteQuery]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((current) => applyNodeChanges(changes, current) as RFNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((current) => {
        const source = nodes.find((node) => node.id === conn.source);
        const color = edgeColor(source?.data.kind as NodeKind | undefined);
        return addEdge(
          {
            ...conn,
            id: uid('edge'),
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color },
            style: { stroke: color, strokeWidth: 2 },
          },
          current,
        );
      }),
    [nodes],
  );

  function createNode(kind: NodeKind, def: NodeTypeDef, position?: { x: number; y: number }) {
    const id = uid(kind);
    const node = toRfNode(
      {
        id,
        kind,
        type: def.type,
        config: {},
        position: position || { x: 120 + nodes.length * 34, y: 120 + nodes.length * 22 },
      },
      language,
    );
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
    setPaletteOpen(false);
    setRunOutput(null);
  }

  function patchNodeData(id: string, patch: Record<string, unknown>) {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== id) return node;
        const data = { ...node.data, ...patch };
        const kind = data.kind as NodeKind;
        const type = data.nodeType as string;
        const config = (data.config as Record<string, unknown>) || {};
        const def = findDef(kind, type);
        return {
          ...node,
          data: {
            ...data,
            icon: def?.icon,
            label: nodeLabel(kind, type, language),
            description: nodeDescription(kind, type, language),
            chips: summaryChips(kind, type, config, language),
            destructive: kind === 'action' && !!def?.destructive,
          },
        };
      }),
    );
  }

  function changeNodeType(type: string) {
    if (!selectedNode) return;
    patchNodeData(selectedNode.id, { nodeType: type, config: {}, runState: 'idle' });
  }

  function changeNodeField(field: FieldDef, value: string) {
    if (!selectedNode) return;
    const config = { ...((selectedNode.data.config as Record<string, unknown>) || {}) };
    const nextValue = normalizeFieldValue(field, value);
    if (nextValue === undefined) delete config[field.key];
    else config[field.key] = nextValue;
    patchNodeData(selectedNode.id, { config, runState: 'idle' });
  }

  async function pickFolder(field: FieldDef) {
    if (!selectedNode || !api?.pickPath) return;
    const result = await api.pickPath({
      type: 'folder',
      title: zh ? `選擇${fieldLabel(field, language)}` : `Choose ${fieldLabel(field, language)}`,
    });
    if (result?.ok && result.path) changeNodeField(field, result.path);
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    const id = selectedNode.id;
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  }

  function duplicateSelectedNode() {
    if (!selectedNode) return;
    const id = uid(selectedNode.data.kind as NodeKind);
    const copy: RFNode = {
      ...selectedNode,
      id,
      selected: false,
      position: {
        x: selectedNode.position.x + 48,
        y: selectedNode.position.y + 48,
      },
      data: { ...selectedNode.data, runState: 'idle' },
    };
    setNodes((current) => [...current, copy]);
    setSelectedNodeId(id);
  }

  function buildWorkflowList(): WorkflowModel[] {
    if (!selected) return workflows;
    const graph = fromRf(nodes, edges);
    const updated: WorkflowModel = { ...selected, ...graph };
    return workflows.map((workflow) => (workflow.id === selected.id ? updated : workflow));
  }

  async function persist(list: WorkflowModel[]): Promise<boolean> {
    if (!api?.workflows?.save) return false;
    const res = await api.workflows.save(list);
    if (res?.ok) {
      localDirtyRef.current = false;
      setWorkflows(list);
      return true;
    }
    notify(res?.error || (zh ? '儲存失敗' : 'Save failed'), 'error');
    return false;
  }

  async function save() {
    setBusy(true);
    const ok = await persist(buildWorkflowList());
    setBusy(false);
    if (ok) notify(zh ? '工作流已儲存' : 'Workflow saved', 'success');
  }

  function newWorkflow() {
    const wf: WorkflowModel = {
      id: uid('wf'),
      name: zh ? '新工作流' : 'New workflow',
      enabled: true,
      nodes: [],
      edges: [],
    };
    const list = [...workflows, wf];
    localDirtyRef.current = true;
    setWorkflows(list);
    selectWorkflow(wf);
  }

  function applyTemplate(build: () => unknown) {
    const tpl = build() as { nodes: Omit<WorkflowNodeModel, 'id'>[] };
    const ids = tpl.nodes.map(() => uid('n'));
    const modelNodes: WorkflowNodeModel[] = tpl.nodes.map((node, index) => ({
      ...node,
      id: ids[index],
    }));
    const modelEdges: WorkflowEdgeModel[] = [];
    for (let index = 0; index < ids.length - 1; index += 1) {
      modelEdges.push({ id: uid('edge'), source: ids[index], target: ids[index + 1] });
    }
    const rf = toRf(
      { id: '', name: '', enabled: true, nodes: modelNodes, edges: modelEdges },
      language,
    );
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setSelectedNodeId(null);
    setRunOutput(null);
  }

  async function renameSelected(name: string) {
    if (!selected) return;
    setWorkflows((list) =>
      list.map((workflow) => (workflow.id === selected.id ? { ...workflow, name } : workflow)),
    );
  }

  async function setWorkflowEnabled(wf: WorkflowModel, enabled: boolean) {
    if (!api?.workflows?.setEnabled) return;
    await api.workflows.setEnabled(wf.id, enabled);
    setWorkflows((list) =>
      list.map((workflow) => (workflow.id === wf.id ? { ...workflow, enabled } : workflow)),
    );
  }

  async function deleteSelected() {
    if (!selected) return;
    const list = workflows.filter((workflow) => workflow.id !== selected.id);
    const ok = await persist(list);
    if (ok) {
      setSelectedId(list[0]?.id || null);
      if (list[0]) selectWorkflow(list[0]);
      else {
        setNodes([]);
        setEdges([]);
      }
    }
  }

  function setAllRunStates(runState: WorkflowRunState) {
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, runState } })));
  }

  function applyStepStates(steps: WorkflowStep[], mode: WorkflowRunResult['mode']) {
    const used = new Set<string>();
    setNodes((current) =>
      current.map((node) => {
        if (node.data.kind !== 'action')
          return { ...node, data: { ...node.data, runState: 'idle' } };
        const direct = steps.find((step) => step.nodeId === node.id);
        const fuzzy = direct
          ? direct
          : steps.find(
              (step) =>
                step.type === node.data.nodeType &&
                !used.has(`${step.type}:${steps.indexOf(step)}`),
            );
        if (!fuzzy) return { ...node, data: { ...node.data, runState: 'idle' } };
        used.add(`${fuzzy.type}:${steps.indexOf(fuzzy)}`);
        const runState: WorkflowRunState =
          mode === 'dry-run' ? 'would-run' : fuzzy.ok === false ? 'fail' : 'ok';
        return { ...node, data: { ...node.data, runState } };
      }),
    );
  }

  async function dryRun() {
    if (!selected || !api?.workflows?.dryRun) return;
    setBusy(true);
    setAllRunStates('idle');
    const saved = await persist(buildWorkflowList());
    if (!saved) {
      setBusy(false);
      return;
    }
    const res = await api.workflows.dryRun(selected.id);
    setBusy(false);
    const result: WorkflowRunResult = {
      mode: 'dry-run',
      ok: res?.ok,
      skipped: res?.skipped,
      steps: res?.steps || [],
    };
    setRunOutput(result);
    applyStepStates(result.steps, result.mode);
  }

  async function executeRun() {
    if (!selected || !api?.workflows?.run) return;
    setConfirmOpen(false);
    setBusy(true);
    setAllRunStates('running');
    const saved = await persist(buildWorkflowList());
    if (!saved) {
      setBusy(false);
      setAllRunStates('idle');
      return;
    }
    const res = await api.workflows.run(selected.id);
    setBusy(false);
    const result: WorkflowRunResult = {
      mode: 'run',
      ok: res?.ok,
      skipped: res?.skipped,
      steps: res?.steps || [],
    };
    setRunOutput(result);
    applyStepStates(result.steps, result.mode);
    notify(
      res?.ok ? (zh ? '工作流已執行' : 'Workflow ran') : zh ? '部分步驟失敗' : 'Some steps failed',
      res?.ok ? 'success' : 'error',
    );
  }

  function run() {
    if (!selected) return;
    const hasDestructive = nodes.some((node) => node.data.destructive);
    if (hasDestructive) setConfirmOpen(true);
    else executeRun();
  }

  function onDragStart(event: React.DragEvent, kind: NodeKind, type: string) {
    event.dataTransfer.setData('application/x-nexus-node', JSON.stringify({ kind, type }));
    event.dataTransfer.effectAllowed = 'copy';
  }

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-nexus-node');
    if (!raw || !flowRef.current) return;
    const payload = JSON.parse(raw) as { kind: NodeKind; type: string };
    const def = findDef(payload.kind, payload.type);
    if (!def) return;
    createNode(
      payload.kind,
      def,
      flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
  }

  const noNodes = selected && nodes.length === 0;

  return (
    <div className="wf-page">
      <div className="wf-toolbar">
        <div className="wf-toolbar-left">
          <button className="wf-btn" onClick={() => onNavigate?.('automations')} type="button">
            {zh ? '← 自動化' : '← Automations'}
          </button>
          <h1>{zh ? '視覺化自動化' : 'Visual Automation'}</h1>
        </div>
        <div className="wf-toolbar-right">
          <div className="wf-add-wrap">
            <button
              className="wf-btn wf-btn-primary"
              data-testid="wf-add-node"
              onClick={() => setPaletteOpen((open) => !open)}
              ref={addButtonRef}
              type="button"
            >
              + {zh ? '新增節點' : 'Add node'}
            </button>
            {paletteOpen ? (
              <div className="wf-node-popover" data-testid="wf-node-popover">
                <input
                  autoFocus
                  className="wf-node-search"
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  placeholder={zh ? '搜尋節點...' : 'Search nodes...'}
                  value={paletteQuery}
                />
                <div className="wf-node-palette">
                  {filteredGroups.map((group) => (
                    <section key={group.kind}>
                      <h3>{kindLabel(group.kind, language)}</h3>
                      {group.defs.map((def) => (
                        <button
                          className="wf-palette-item"
                          data-testid={`wf-palette-${group.kind}-${def.type}`}
                          draggable
                          key={def.type}
                          onClick={() => createNode(group.kind, def)}
                          onDragStart={(event) => onDragStart(event, group.kind, def.type)}
                          type="button"
                        >
                          <span className={`wf-palette-icon kind-${group.kind}`}>
                            {def.icon.slice(0, 2)}
                          </span>
                          <span>
                            <strong>{zh ? def.label : def.labelEn}</strong>
                            <em>{zh ? def.desc : def.descEn}</em>
                          </span>
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button className="wf-btn" disabled={busy || !selected} onClick={dryRun} type="button">
            {zh ? '預演' : 'Dry run'}
          </button>
          <button
            className="wf-btn wf-btn-primary"
            disabled={busy || !selected}
            onClick={run}
            type="button"
          >
            {zh ? '執行' : 'Run'}
          </button>
          <button
            className="wf-btn wf-btn-primary"
            disabled={busy || !selected}
            onClick={save}
            type="button"
          >
            {zh ? '儲存' : 'Save'}
          </button>
        </div>
      </div>

      <div className="wf-body">
        <aside className="wf-list">
          <div className="wf-list-head">
            <span>{zh ? '工作流' : 'Workflows'}</span>
            <button
              className="wf-btn wf-btn-sm"
              data-testid="wf-new"
              onClick={newWorkflow}
              type="button"
            >
              +
            </button>
          </div>
          {workflows.map((wf) => (
            <button
              key={wf.id}
              className={`wf-list-item${wf.id === selectedId ? ' active' : ''}`}
              data-testid="wf-list-item"
              onClick={() => selectWorkflow(wf)}
              type="button"
            >
              <span className={`wf-dot${wf.enabled ? ' on' : ''}`} />
              <span className="wf-list-name">{wf.name}</span>
            </button>
          ))}
          {workflows.length === 0 ? (
            <div className="wf-empty">{zh ? '還沒有工作流' : 'No workflows yet'}</div>
          ) : null}
          <div className="wf-templates">
            <div className="wf-templates-title">{zh ? '範本' : 'Templates'}</div>
            {starterTemplates().map((tpl) => (
              <button
                key={tpl.nameEn}
                className="wf-btn wf-btn-sm wf-tpl"
                data-testid={`wf-template-${tpl.nameEn}`}
                disabled={!selected}
                onClick={() => applyTemplate(tpl.build)}
                type="button"
              >
                {zh ? tpl.name : tpl.nameEn}
              </button>
            ))}
          </div>
        </aside>

        <div className="wf-canvas" data-testid="wf-canvas">
          <ReactFlow
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onEdgesChange={onEdgesChange}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onNodesChange={onNodesChange}
            onPaneClick={() => setSelectedNodeId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="rgba(103, 232, 249, 0.22)" gap={24} size={1.4} />
            <Controls className="wf-controls" />
            <MiniMap
              bgColor="rgba(6, 16, 39, 0.94)"
              className="wf-minimap"
              maskColor="rgba(3, 7, 18, 0.58)"
              nodeColor={(node) => edgeColor(node.data.kind as NodeKind)}
              pannable
              zoomable
            />
          </ReactFlow>
          {!selected ? (
            <div className="wf-canvas-empty">
              <strong>{zh ? '建立第一個工作流' : 'Create your first workflow'}</strong>
              <span>
                {zh
                  ? '從左側新增工作流，再用節點面板開始編排。'
                  : 'Add a workflow, then use the node palette to start.'}
              </span>
              <button className="wf-btn wf-btn-primary" onClick={newWorkflow} type="button">
                {zh ? '新增工作流' : 'New workflow'}
              </button>
            </div>
          ) : noNodes ? (
            <div className="wf-canvas-empty">
              <strong>
                {zh ? '從範本開始，或新增節點' : 'Start from a template or add nodes'}
              </strong>
              <span>
                {zh
                  ? '把節點拖到畫布，或點選節點面板中的項目。'
                  : 'Drag nodes onto the canvas or click an item in the palette.'}
              </span>
              <div className="wf-empty-actions">
                {starterTemplates().map((tpl) => (
                  <button
                    className="wf-btn"
                    key={tpl.nameEn}
                    onClick={() => applyTemplate(tpl.build)}
                    type="button"
                  >
                    {zh ? tpl.name : tpl.nameEn}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="wf-inspector">
          <section className="wf-inspector-section">
            <h2>{zh ? '工作流' : 'Workflow'}</h2>
            {selected ? (
              <>
                <div className="wf-field">
                  <label>{zh ? '名稱' : 'Name'}</label>
                  <input
                    onChange={(event) => renameSelected(event.target.value)}
                    placeholder={zh ? '工作流名稱' : 'Workflow name'}
                    value={selected.name}
                  />
                </div>
                <div className="wf-toggle-row">
                  <span>{zh ? '啟用' : 'Enabled'}</span>
                  <Toggle
                    checked={selected.enabled}
                    onChange={(checked: boolean) => setWorkflowEnabled(selected, checked)}
                  />
                </div>
              </>
            ) : (
              <div className="wf-hint">{zh ? '尚未選取工作流。' : 'No workflow selected.'}</div>
            )}
          </section>

          <section className="wf-inspector-section">
            <h2>{zh ? '選取節點' : 'Selected node'}</h2>
            {selectedNode ? (
              <>
                <div className="wf-node-meta">
                  <StatusBadge tone={selectedNode.data.destructive ? 'danger' : 'ok'}>
                    {kindLabel(selectedNode.data.kind as NodeKind, language)}
                  </StatusBadge>
                  <p>{String(selectedNode.data.description || '')}</p>
                </div>
                <div className="wf-field">
                  <label>{zh ? '型別' : 'Type'}</label>
                  <select
                    onChange={(event) => changeNodeType(event.target.value)}
                    value={selectedNode.data.nodeType as string}
                  >
                    {catalogFor(selectedNode.data.kind as NodeKind).map((def) => (
                      <option key={def.type} value={def.type}>
                        {zh ? def.label : def.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
                {(selectedDef?.fields || []).map((field) => {
                  const config = (selectedNode.data.config as Record<string, unknown>) || {};
                  const value = valueForInput(field, config[field.key]);
                  return (
                    <div className="wf-field" key={field.key}>
                      <label>{fieldLabel(field, language)}</label>
                      <div className="wf-input-row">
                        <input
                          onChange={(event) => changeNodeField(field, event.target.value)}
                          placeholder={field.placeholder}
                          type={
                            field.kind === 'time'
                              ? 'time'
                              : field.kind === 'number'
                                ? 'number'
                                : 'text'
                          }
                          value={value}
                        />
                        {field.unit ? <span className="wf-unit">{field.unit}</span> : null}
                        {field.kind === 'folder' ? (
                          <button
                            className="wf-btn wf-btn-sm"
                            onClick={() => pickFolder(field)}
                            type="button"
                          >
                            {zh ? '選擇...' : 'Choose...'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!selectedDef?.fields.length ? (
                  <InlineAlert tone="info" title={zh ? '無需設定' : 'No fields'}>
                    {zh ? '這個節點可直接使用。' : 'This node can run without additional config.'}
                  </InlineAlert>
                ) : null}
                <div className="wf-node-actions">
                  <button className="wf-btn" onClick={duplicateSelectedNode} type="button">
                    {zh ? '複製節點' : 'Duplicate'}
                  </button>
                  <button
                    className="wf-btn wf-btn-danger"
                    onClick={deleteSelectedNode}
                    type="button"
                  >
                    {zh ? '刪除節點' : 'Delete node'}
                  </button>
                </div>
              </>
            ) : (
              <div className="wf-hint">
                {zh
                  ? '點選畫布上的節點即可編輯，或從「新增節點」面板拖曳節點到畫布。'
                  : 'Click a node to edit it, or drag a node from the Add node panel onto the canvas.'}
              </div>
            )}
          </section>

          <section className="wf-inspector-section wf-result-section">
            <h2>{zh ? '執行結果' : 'Run result'}</h2>
            {runOutput ? (
              <div className="wf-result-list" data-testid="wf-run-output">
                {runOutput.skipped ? (
                  <InlineAlert tone="warn" title={zh ? '未觸發' : 'Skipped'}>
                    {runOutput.skipped === 'no-trigger'
                      ? zh
                        ? '沒有符合的觸發節點。'
                        : 'No matching trigger node.'
                      : runOutput.skipped}
                  </InlineAlert>
                ) : null}
                {!runOutput.skipped && !runOutput.steps.length ? (
                  <InlineAlert tone="info" title={zh ? '沒有動作' : 'No actions'}>
                    {zh
                      ? '這個工作流目前不會執行任何動作。'
                      : 'This workflow would not run any actions.'}
                  </InlineAlert>
                ) : null}
                {runOutput.steps.map((step, index) => (
                  <div className="wf-result-row" key={`${step.type}-${index}`}>
                    <StatusBadge tone={stepTone(step, runOutput.mode)}>
                      {runOutput.mode === 'dry-run' ? 'DRY' : step.ok === false ? 'FAIL' : 'OK'}
                    </StatusBadge>
                    <span>
                      <strong>{nodeLabel('action', step.type, language)}</strong>
                      {step.error ? <em>{step.error}</em> : null}
                      {step.destructive ? (
                        <em>{zh ? '需確認的檔案動作' : 'Needs confirmation'}</em>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wf-hint">
                {zh
                  ? '預演或執行後會顯示每一步結果。'
                  : 'Dry-run or run the workflow to see step results.'}
              </div>
            )}
          </section>

          {selected ? (
            <button
              className="wf-btn wf-btn-danger wf-delete-wf"
              onClick={deleteSelected}
              type="button"
            >
              {zh ? '刪除工作流' : 'Delete workflow'}
            </button>
          ) : null}
        </aside>
      </div>

      <Dialog
        cancelLabel={zh ? '取消' : 'Cancel'}
        confirmLabel={zh ? '確認執行' : 'Run workflow'}
        danger
        message={
          zh
            ? '此工作流包含會移動或整理檔案的動作。確認後會直接執行。'
            : 'This workflow contains actions that move or organize files. Confirm to run it now.'
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={executeRun}
        open={confirmOpen}
        title={zh ? '確認執行危險動作' : 'Confirm file-changing actions'}
      />
    </div>
  );
}
