import { describe, expect, it } from 'vitest';
import {
  adaptDashboardNodes,
  buildGlobeLayout,
  buildGlobeRelationships,
  getProgressiveGlobeNodes,
  groupDashboardNodes,
  scoreDashboardNode,
} from './globeLayout.js';

const nodes = [
  { id: 'file-a', label: 'Documents', type: 'file', status: 'normal', value: 10 },
  { id: 'file-b', label: 'Downloads', type: 'file', status: 'warning', value: 3 },
  { id: 'project-a', label: 'NEXUS', type: 'project', status: 'good', value: 20 },
  { id: 'system-a', label: 'CPU', type: 'system', status: 'danger', value: 91 },
  { id: 'automation-a', label: 'Rules', type: 'automation', status: 'good', value: 4 },
];

describe('groupDashboardNodes', () => {
  it('preserves product categories and ranks urgent nodes first', () => {
    const groups = groupDashboardNodes(nodes);
    expect(groups.map((group) => group.id)).toEqual(['file', 'project', 'system', 'automation']);
    expect(groups[0].nodes.map((node) => node.id)).toEqual(['file-b', 'file-a']);
  });

  it('keeps at least one node per category when limiting a dense data set', () => {
    const dense = [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `file-${index}`,
        label: `File ${index}`,
        type: 'file',
        value: index,
      })),
      { id: 'project', label: 'Project', type: 'project' },
      { id: 'system', label: 'System', type: 'system' },
    ];
    const groups = groupDashboardNodes(dense, 4);
    expect(groups.reduce((sum, group) => sum + group.nodes.length, 0)).toBe(4);
    expect(groups.map((group) => group.id)).toEqual(['file', 'project', 'system']);
  });
});

describe('buildGlobeLayout', () => {
  it('returns stable hierarchical positions with non-overlapping nodes', () => {
    const first = buildGlobeLayout(nodes);
    const second = buildGlobeLayout([...nodes].reverse());
    const positions = first.flatMap((group) => group.positionedNodes.map((item) => item.position));
    expect(first).toEqual(second);
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        const distance = Math.hypot(
          positions[left][0] - positions[right][0],
          positions[left][1] - positions[right][1],
          positions[left][2] - positions[right][2],
        );
        expect(distance).toBeGreaterThan(0.28);
      }
    }
  });

  it('attaches deterministic relationship and disclosure metadata', () => {
    const first = buildGlobeLayout([
      { id: 'root', label: 'Root', type: 'file', path: 'C:/Data' },
      { id: 'child', label: 'Child', type: 'file', path: 'C:/Data/Child' },
    ]);
    const positioned = first[0].positionedNodes.find((item) => item.node.id === 'child');
    expect(positioned.parentId).toBe('root');
    expect(positioned.disclosure).toEqual({ level: 0, order: 0, overview: true, expanded: true });
    expect(positioned.position).toHaveLength(3);
  });

  it('uses the full three-dimensional orbital volume for dense real data', () => {
    const dense = Array.from({ length: 36 }, (_, index) => ({
      id: `real-node-${index}`,
      label: `Node ${index}`,
      type: ['file', 'project', 'system', 'cleanup', 'automation'][index % 5],
      value: index + 1,
    }));
    const positions = buildGlobeLayout(dense).flatMap((group) =>
      group.positionedNodes.map((item) => item.position),
    );
    const range = (axis) => {
      const values = positions.map((position) => position[axis]);
      return Math.max(...values) - Math.min(...values);
    };
    expect(positions).toHaveLength(36);
    expect(range(0)).toBeGreaterThan(5.5);
    expect(range(1)).toBeGreaterThan(3.2);
    expect(range(2)).toBeGreaterThan(1.5);
  });
});

describe('globe data adapter and relationships', () => {
  it('normalizes aliases, derives values, and does not mutate input', () => {
    const source = {
      id: 'folder',
      name: 'Downloads',
      type: 'folder',
      count: 4,
      meta: { folder: true },
    };
    const adapted = adaptDashboardNodes([source]);
    expect(adapted[0]).toMatchObject({
      id: 'folder',
      label: 'Downloads',
      type: 'file',
      kind: 'folder',
      value: 4,
      depth: 0,
    });
    expect(source).not.toHaveProperty('kind');
  });

  it('treats path-backed file-category nodes as folders for 3D rendering', () => {
    expect(
      adaptDashboardNodes([
        { id: 'downloads', label: 'Downloads', type: 'file', path: 'C:/Users/me/Downloads' },
        {
          id: 'documents-category',
          label: 'Documents',
          type: 'file',
          meta: { category: 'Documents' },
        },
      ]),
    ).toMatchObject([
      { id: 'downloads', kind: 'folder' },
      { id: 'documents-category', kind: 'file' },
    ]);
  });

  it('builds explicit and path-derived edges in stable order', () => {
    const model = buildGlobeRelationships([
      { id: 'root', label: 'Root', type: 'file', path: 'C:/Data' },
      { id: 'child', label: 'Child', type: 'file', path: 'C:/Data/Child', parentId: 'root' },
      { id: 'related', label: 'Related', type: 'project', relatedIds: ['child'] },
    ]);
    expect(model.edges).toEqual([
      { source: 'related', target: 'child', relation: 'related' },
      { source: 'root', target: 'child', relation: 'parent' },
    ]);
    expect(model.adjacency.root).toEqual(['child']);
  });

  it('reveals ranked nodes progressively while retaining category coverage', () => {
    const dense = Array.from({ length: 40 }, (_, index) => ({
      id: `file-${index}`,
      label: `File ${index}`,
      type: index % 3 ? 'file' : 'project',
      status: index === 0 ? 'danger' : 'normal',
      value: index + 1,
    }));
    const overview = getProgressiveGlobeNodes(dense, { stage: 'overview', initial: 4, max: 34 });
    const full = getProgressiveGlobeNodes(dense, { stage: 'full', max: 34 });
    expect(overview.length).toBe(4);
    expect(overview.some((node) => node.type === 'file')).toBe(true);
    expect(overview.some((node) => node.type === 'project')).toBe(true);
    expect(full.length).toBe(34);
    expect(getProgressiveGlobeNodes(dense, { stage: 'overview', initial: 4 })).toEqual(overview);
  });
});

describe('scoreDashboardNode', () => {
  it('matches labels and paths without inventing metadata', () => {
    expect(scoreDashboardNode({ label: 'Downloads', path: 'C:\\Users\\me' }, 'downloads')).toBe(
      100,
    );
    expect(scoreDashboardNode({ label: 'Downloads', path: 'C:\\Users\\me' }, 'missing')).toBe(0);
  });
});
