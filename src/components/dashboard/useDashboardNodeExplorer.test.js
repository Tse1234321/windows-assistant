import { describe, expect, it } from 'vitest';
import { adaptBrowseResult } from './useDashboardNodeExplorer.js';

describe('adaptBrowseResult', () => {
  it('maps real browse metadata to stable folder and file scene nodes', () => {
    const response = {
      ok: true,
      folders: [
        {
          name: 'Reports',
          path: 'C:\\Data\\Reports',
          itemCount: 7,
          updatedAt: '2026-07-10T03:00:00.000Z',
        },
      ],
      files: [
        {
          name: 'summary.csv',
          path: 'C:\\Data\\summary.csv',
          sizeBytes: 512,
          ext: '.csv',
          updatedAt: '2026-07-10T03:00:00.000Z',
        },
      ],
    };
    const first = adaptBrowseResult(response, { id: 'data-root' });
    const second = adaptBrowseResult(response, { id: 'data-root' });
    expect(first).toEqual(second);
    expect(first).toMatchObject([
      {
        label: 'Reports',
        kind: 'folder',
        type: 'file',
        parentId: 'data-root',
        value: 7,
      },
      {
        label: 'summary.csv',
        kind: 'file',
        type: 'file',
        parentId: 'data-root',
        value: 512,
      },
    ]);
    expect(first[0].id).not.toBe(first[1].id);
  });

  it('returns no nodes for failed reads instead of fabricating contents', () => {
    expect(adaptBrowseResult({ ok: false, error: 'denied' }, { id: 'root' })).toEqual([]);
  });
});
