import { describe, it, expect } from 'vitest';
import { normalizePath, matchesStatus, sortProjects } from './projectSort.js';

const ws = (...paths) => new Set(paths.map(normalizePath));

describe('normalizePath', () => {
  it('lowercases and trims', () => {
    expect(normalizePath('  C:\\Foo\\Bar  ')).toBe('c:\\foo\\bar');
    expect(normalizePath(null)).toBe('');
  });
});

describe('matchesStatus', () => {
  const repo = { path: 'C:/a', isGitRepo: true, modifiedCount: 0, exists: true };
  const dirty = { path: 'C:/b', isGitRepo: true, modifiedCount: 3, exists: true };
  const folder = { path: 'C:/c', isGitRepo: false, modifiedCount: 0, exists: true };
  const missing = { path: 'C:/d', isGitRepo: false, modifiedCount: 0, exists: false };

  it('all matches everything', () => {
    expect(matchesStatus(repo, 'all', ws())).toBe(true);
  });
  it('git / dirty / folder / missing filters', () => {
    expect(matchesStatus(repo, 'git', ws())).toBe(true);
    expect(matchesStatus(folder, 'git', ws())).toBe(false);
    expect(matchesStatus(dirty, 'dirty', ws())).toBe(true);
    expect(matchesStatus(repo, 'dirty', ws())).toBe(false);
    expect(matchesStatus(folder, 'folder', ws())).toBe(true);
    expect(matchesStatus(repo, 'folder', ws())).toBe(false);
    expect(matchesStatus(missing, 'missing', ws())).toBe(true);
    expect(matchesStatus(repo, 'missing', ws())).toBe(false);
  });
  it('pinned uses the (normalized) workspace path set', () => {
    expect(matchesStatus(repo, 'pinned', ws('c:/a'))).toBe(true);
    expect(matchesStatus(repo, 'pinned', ws('c:/x'))).toBe(false);
  });
});

describe('sortProjects', () => {
  const items = [
    { name: 'beta', path: 'C:/beta', weight: 5, category: 'B', lastModified: '2024-01-02' },
    { name: 'alpha', path: 'C:/alpha', weight: 9, category: 'A', lastModified: '2024-03-01' },
    { name: 'gamma', path: 'C:/gamma', weight: 9, category: 'A', lastModified: '2024-02-01' },
  ];

  it('does not mutate the input array', () => {
    const copy = [...items];
    sortProjects(items, 'name', ws());
    expect(items).toEqual(copy);
  });

  it('sorts by name', () => {
    expect(sortProjects(items, 'name', ws()).map((p) => p.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('default score sort is by weight desc, name tiebreak', () => {
    expect(sortProjects(items, 'score', ws()).map((p) => p.name)).toEqual([
      'alpha',
      'gamma',
      'beta',
    ]);
  });

  it('modified sort is newest first', () => {
    expect(sortProjects(items, 'modified', ws()).map((p) => p.name)).toEqual([
      'alpha',
      'gamma',
      'beta',
    ]);
  });

  it('pinned projects float to the top regardless of sort key', () => {
    const result = sortProjects(items, 'name', ws('c:/gamma'));
    expect(result[0].name).toBe('gamma');
  });
});
