export const MAX_GLOBE_NODES = 60;

/**
 * The renderer only needs a small, stable view of the dashboard payload.  Keep
 * the adapter here (rather than in an animation loop) so that both the canvas
 * and the HTML directory use the same model.  These aliases intentionally stay
 * framework agnostic; they are also useful to consumers which render a
 * low-fidelity/mobile fallback.
 */
export const GLOBE_DISCLOSURE_STAGES = Object.freeze({
  overview: 0,
  expanded: 1,
  full: 2,
});

const STATUS_WEIGHT = { danger: 4, warning: 3, normal: 2, good: 1 };

export const GLOBE_GROUPS = [
  { id: 'file', labelKey: 'dashboard.coreFiles', color: 0x38bdf8 },
  { id: 'project', labelKey: 'dashboard.coreProjects', color: 0xa78bfa },
  { id: 'system', labelKey: 'dashboard.coreSystem', color: 0x22d3ee },
  { id: 'cleanup', labelKey: 'dashboard.coreCleanup', color: 0xf472b6 },
  { id: 'automation', labelKey: 'dashboard.coreAutomation', color: 0x34d399 },
  { id: 'other', labelKey: 'dashboard.coreOther', color: 0x94a3b8 },
];

export function getNodeValue(node) {
  return Math.max(1, Number(node?.value || node?.count || node?.sizeBytes || 1));
}

const TYPE_ALIASES = {
  folder: 'file',
  directory: 'file',
  document: 'file',
  documents: 'file',
  files: 'file',
  projecthub: 'project',
  projects: 'project',
  metrics: 'system',
  monitor: 'system',
  health: 'system',
  cleanupcenter: 'cleanup',
  clean: 'cleanup',
  automationrule: 'automation',
  automations: 'automation',
};

function canonicalType(type) {
  const value = String(type || 'other')
    .trim()
    .toLowerCase();
  return (
    TYPE_ALIASES[value] || (GLOBE_GROUPS.some((group) => group.id === value) ? value : 'other')
  );
}

function normalisePath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

function pathDepth(path) {
  const value = normalisePath(path);
  return value ? value.split('/').filter(Boolean).length : 0;
}

/** Convert one dashboard service node to the renderer's stable shape. */
export function normalizeGlobeNode(input, index = 0) {
  const source = input && typeof input === 'object' ? input : {};
  const fallbackId = `globe-node-${index}`;
  const id = String(source.id ?? source.key ?? source.path ?? fallbackId);
  const type = canonicalType(source.type || source.category || source.kind);
  const metadata = source.meta && typeof source.meta === 'object' ? { ...source.meta } : {};
  const parentId =
    source.parentId ?? source.parent_id ?? metadata.parentId ?? metadata.parent_id ?? null;
  const explicitRelated =
    source.relatedIds || source.related || source.links || metadata.relatedIds || metadata.related;
  const relatedIds = Array.isArray(explicitRelated)
    ? explicitRelated
        .map((value) =>
          value && typeof value === 'object' ? (value.id ?? value.targetId ?? value.target) : value,
        )
        .map((value) => String(value || ''))
        .filter(Boolean)
    : [];
  const explicitChildren =
    source.children || source.childIds || metadata.children || metadata.childIds;
  const childIds = Array.isArray(explicitChildren)
    ? explicitChildren
        .map((value) => (value && typeof value === 'object' ? value.id : value))
        .map((value) => String(value || ''))
        .filter(Boolean)
    : [];
  const isFolder = Boolean(
    metadata.folder ||
    source.isFolder ||
    source.kind === 'folder' ||
    source.type === 'folder' ||
    (type === 'file' && source.path && !metadata.category),
  );

  return {
    ...source,
    id,
    label: String(source.label ?? source.name ?? id),
    type,
    groupId: type,
    kind:
      source.kind && source.kind !== 'folder'
        ? String(source.kind)
        : isFolder
          ? 'folder'
          : type === 'file'
            ? 'file'
            : type,
    status: String(source.status || 'normal').toLowerCase(),
    value: getNodeValue(source),
    path: source.path == null ? '' : String(source.path),
    parentId: parentId == null || parentId === '' ? null : String(parentId),
    relatedIds,
    childIds,
    depth: Number.isFinite(Number(source.depth)) ? Number(source.depth) : pathDepth(source.path),
    meta: metadata,
  };
}

/** Adapt a dashboard response without mutating it or allowing duplicate ids. */
export function adaptDashboardNodes(nodes) {
  const seen = new Set();
  const adapted = (Array.isArray(nodes) ? nodes : [])
    .map((node, index) => normalizeGlobeNode(node, index))
    .filter((node) => {
      if (!node.id || seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  const byPath = new Map(
    adapted.map((node) => [normalisePath(node.path), node.id]).filter(([path]) => Boolean(path)),
  );
  return adapted.map((node) => {
    if (node.parentId || !node.path) return node;
    const parts = normalisePath(node.path).split('/');
    while (parts.length > 1) {
      parts.pop();
      const parentId = byPath.get(parts.join('/'));
      if (parentId) return { ...node, parentId };
    }
    return node;
  });
}

// Descriptive alias retained for callers which use "normalize" American spelling.
export const normalizeDashboardNodes = adaptDashboardNodes;
export const toGlobeNodes = adaptDashboardNodes;

function compareNodes(a, b) {
  return (
    (STATUS_WEIGHT[b?.status] || 0) - (STATUS_WEIGHT[a?.status] || 0) ||
    getNodeValue(b) - getNodeValue(a) ||
    String(a?.label || '').localeCompare(String(b?.label || ''), undefined, {
      sensitivity: 'base',
    }) ||
    String(a?.id || '').localeCompare(String(b?.id || ''))
  );
}

function groupDefinition(type) {
  return GLOBE_GROUPS.find((group) => group.id === canonicalType(type)) || GLOBE_GROUPS.at(-1);
}

export function groupDashboardNodes(nodes, limit = MAX_GLOBE_NODES) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const buckets = new Map(GLOBE_GROUPS.map((group) => [group.id, []]));

  for (const candidate of Array.isArray(nodes) ? nodes : []) {
    if (!candidate?.id) continue;
    buckets.get(groupDefinition(candidate.type).id).push(candidate);
  }

  const groups = GLOBE_GROUPS.map((definition) => ({
    ...definition,
    nodes: buckets.get(definition.id).sort(compareNodes),
  })).filter((group) => group.nodes.length);

  let total = groups.reduce((sum, group) => sum + group.nodes.length, 0);
  while (total > safeLimit) {
    const reducible = groups
      .filter((group) => group.nodes.length > 1)
      .sort((a, b) => b.nodes.length - a.nodes.length)[0];
    const fallback = groups.filter((group) => group.nodes.length).at(-1);
    const target = reducible || fallback;
    if (!target) break;
    target.nodes.pop();
    total -= 1;
  }

  return groups.filter((group) => group.nodes.length);
}

function addRelationship(edgeMap, source, target, relation) {
  if (!source || !target || source === target) return;
  const key = `${source}\u0000${target}`;
  const reverse = `${target}\u0000${source}`;
  const existing = edgeMap.get(key) || edgeMap.get(reverse);
  if (existing) {
    // Explicit hierarchy is more useful to renderers than a generic related edge.
    if (relation === 'parent' && existing.relation !== 'parent') {
      edgeMap.delete(key);
      edgeMap.delete(reverse);
      edgeMap.set(key, { source, target, relation });
    }
    return;
  }
  edgeMap.set(key, { source, target, relation });
}

/** Build deterministic parent/related edges from real node metadata and paths. */
export function buildGlobeRelationships(nodes) {
  const adapted = adaptDashboardNodes(nodes);
  const byId = new Map(adapted.map((node) => [node.id, node]));
  const byPath = new Map();
  adapted.forEach((node) => {
    const path = normalisePath(node.path);
    if (path) byPath.set(path, node.id);
  });

  const edgeMap = new Map();
  adapted.forEach((node) => {
    if (node.parentId && byId.has(node.parentId))
      addRelationship(edgeMap, node.parentId, node.id, 'parent');
    node.relatedIds.forEach((relatedId) => {
      if (byId.has(relatedId)) addRelationship(edgeMap, node.id, relatedId, 'related');
    });
    node.childIds.forEach((childId) => {
      if (byId.has(childId)) addRelationship(edgeMap, node.id, childId, 'parent');
    });
    const parent = normalisePath(node.path);
    if (parent) {
      const parts = parent.split('/');
      while (parts.length > 1) {
        parts.pop();
        const parentNodeId = byPath.get(parts.join('/'));
        if (parentNodeId) {
          addRelationship(edgeMap, parentNodeId, node.id, 'path');
          break;
        }
      }
    }
  });

  const edges = [...edgeMap.values()].sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target) ||
      a.relation.localeCompare(b.relation),
  );
  const adjacency = Object.fromEntries(adapted.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    adjacency[edge.source].push(edge.target);
    adjacency[edge.target].push(edge.source);
  });
  Object.values(adjacency).forEach((list) => list.sort());
  return { nodes: adapted, edges, adjacency };
}

export const buildRelationshipMetadata = buildGlobeRelationships;
export const getGlobeRelationships = (nodes) => buildGlobeRelationships(nodes).edges;

/**
 * Return a stable subset for staged disclosure.  Overview keeps one urgent
 * node in each category; expanded/full progressively reveal the ranked list.
 */
export function getProgressiveGlobeNodes(nodes, options = {}) {
  const config =
    typeof options === 'string' || typeof options === 'number' ? { stage: options } : options || {};
  const stageValue = config.stage == null ? GLOBE_DISCLOSURE_STAGES.full : config.stage;
  const stage =
    typeof stageValue === 'string'
      ? (GLOBE_DISCLOSURE_STAGES[stageValue] ?? 2)
      : Number(stageValue);
  const normalizedStage = Math.max(0, Math.min(2, Math.floor(Number.isFinite(stage) ? stage : 2)));
  const max = Math.max(
    0,
    Math.floor(Number(config.max ?? config.maxNodes ?? config.limit ?? MAX_GLOBE_NODES) || 0),
  );
  const initial = Math.max(1, Math.floor(Number(config.initial ?? Math.min(12, max || 12)) || 1));
  const expanded = Math.max(
    initial,
    Math.floor(Number(config.expanded ?? Math.min(24, max || 24)) || initial),
  );
  const cap = normalizedStage === 0 ? initial : normalizedStage === 1 ? expanded : max;
  const adapted = adaptDashboardNodes(nodes);
  const groups = groupDashboardNodes(adapted, cap);
  return groups.flatMap((group) => group.nodes);
}

export const getProgressiveDisclosure = getProgressiveGlobeNodes;

export function buildGlobeLayout(nodes, options = {}) {
  const compact = options.compact === true;
  const sourceNodes = options.stage == null ? nodes : getProgressiveGlobeNodes(nodes, options);
  const groups = groupDashboardNodes(
    sourceNodes,
    options.limit ?? options.maxNodes ?? MAX_GLOBE_NODES,
  );
  const relationships = buildGlobeRelationships(sourceNodes);
  const relationByNode = new Map();
  relationships.edges.forEach((edge) => {
    relationByNode.set(edge.source, [...(relationByNode.get(edge.source) || []), edge]);
    relationByNode.set(edge.target, [...(relationByNode.get(edge.target) || []), edge]);
  });
  const groupCount = Math.max(1, groups.length);
  const hubRadiusX = compact ? 2.8 : 3.55;
  const hubRadiusY = compact ? 1.82 : 2.5;
  const columns = compact ? 2 : 3;
  const tangentGap = compact ? 0.32 : 0.42;
  const radialGap = compact ? 0.3 : 0.4;

  return groups.map((group, groupIndex) => {
    const radialCloud = groupCount === 1 && group.nodes.length > 6;
    const angle = -Math.PI / 2 + (Math.PI * 2 * groupIndex) / groupCount;
    const outward = [Math.cos(angle), Math.sin(angle)];
    const tangent = [-outward[1], outward[0]];
    const hubDepth = compact ? Math.sin(angle * 1.7) * 0.38 : Math.sin(angle * 1.7) * 0.82;
    const hubPosition = radialCloud
      ? [0, 0, 0]
      : [outward[0] * hubRadiusX, outward[1] * hubRadiusY, hubDepth];
    const positionedNodes = group.nodes.map((node, nodeIndex) => {
      const row = Math.floor(nodeIndex / columns);
      const rowStart = row * columns;
      const rowLength = Math.min(columns, group.nodes.length - rowStart);
      const column = nodeIndex - rowStart;
      const tangentOffset = (column - (rowLength - 1) / 2) * tangentGap;
      const outwardOffset = 0.52 + row * radialGap;
      const stable = [...String(node.id)].reduce(
        (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
        2166136261,
      );
      const depthJitter = (((stable >>> 0) % 1000) / 999 - 0.5) * (compact ? 0.5 : 1.15);
      const depth = hubDepth + ((nodeIndex % 3) - 1) * (compact ? 0.28 : 0.52) + depthJitter;
      const cloudProgress = (nodeIndex + 0.5) / Math.max(1, group.nodes.length);
      const cloudY = 1 - cloudProgress * 2;
      const cloudRadius = (compact ? 2.7 : 3.35) + (nodeIndex % 3) * 0.3;
      const cloudRingRadius = Math.sqrt(Math.max(0, 1 - cloudY * cloudY)) * cloudRadius;
      const cloudAngle = nodeIndex * Math.PI * (3 - Math.sqrt(5));
      const inferredParent = (relationByNode.get(String(node.id)) || []).find(
        (edge) =>
          edge.target === String(node.id) &&
          (edge.relation === 'parent' || edge.relation === 'path'),
      )?.source;
      return {
        node,
        groupId: group.id,
        parentId: node.parentId || inferredParent || null,
        relationships: relationByNode.get(String(node.id)) || [],
        disclosure: {
          level: row,
          order: nodeIndex,
          overview: nodeIndex === 0,
          expanded: nodeIndex < columns,
        },
        position: radialCloud
          ? [
              Math.cos(cloudAngle) * cloudRingRadius * 1.18,
              cloudY * cloudRadius * 0.76,
              Math.sin(cloudAngle) * cloudRingRadius * 0.58 + depthJitter * 0.28,
            ]
          : [
              hubPosition[0] + outward[0] * outwardOffset + tangent[0] * tangentOffset,
              hubPosition[1] + outward[1] * outwardOffset + tangent[1] * tangentOffset,
              depth,
            ],
      };
    });

    return { ...group, angle, hubPosition, positionedNodes };
  });
}

/** Build the complete model consumed by rich renderers and non-WebGL fallbacks. */
export function buildProgressiveGlobeModel(nodes, options = {}) {
  const relationships = buildGlobeRelationships(nodes);
  const visibleNodes = getProgressiveGlobeNodes(nodes, options);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const layout = buildGlobeLayout(visibleNodes, options);
  return {
    nodes: relationships.nodes,
    visibleNodes,
    hiddenNodes: relationships.nodes.filter((node) => !visibleIds.has(node.id)),
    relationships: relationships.edges,
    adjacency: relationships.adjacency,
    layout,
  };
}

export function normalizeNodeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .trim();
}

export function scoreDashboardNode(node, searchValue) {
  const query = normalizeNodeSearch(searchValue);
  if (!query) return 0;
  const label = normalizeNodeSearch(node?.label);
  const path = normalizeNodeSearch(node?.path);
  const type = normalizeNodeSearch(node?.type);
  const status = normalizeNodeSearch(node?.status);
  const corpus = `${label} ${path} ${type} ${status}`;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.every((token) => corpus.includes(token))) return 0;
  return (
    10 +
    (label === query ? 90 : label.startsWith(query) ? 70 : label.includes(query) ? 50 : 0) +
    (path.includes(query) ? 35 : 0) +
    (type.includes(query) || status.includes(query) ? 12 : 0)
  );
}
