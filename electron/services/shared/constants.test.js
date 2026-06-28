import { describe, it, expect } from 'vitest';
import constants from './constants.js';
import settingsService from '../settingsService.js';

const { PROJECT_EXCLUDES } = constants;
const { defaultProjectHubSettings } = settingsService;

describe('PROJECT_EXCLUDES', () => {
  it('is frozen and free of duplicates', () => {
    expect(Object.isFrozen(PROJECT_EXCLUDES)).toBe(true);
    expect(new Set(PROJECT_EXCLUDES).size).toBe(PROJECT_EXCLUDES.length);
  });

  it('covers system paths and common build/cache folders', () => {
    for (const entry of ['C:\\Windows', 'node_modules', '.git', '__pycache__', 'target']) {
      expect(PROJECT_EXCLUDES).toContain(entry);
    }
  });

  it('is the single source for the project-hub default excludes', () => {
    expect(defaultProjectHubSettings().excludeFolders).toEqual([...PROJECT_EXCLUDES]);
  });
});
