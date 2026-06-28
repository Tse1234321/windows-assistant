import { describe, it, expect } from 'vitest';
// fileClassifier is CommonJS; import the default export and destructure.
import fileClassifier from './fileClassifier.js';

const { classifyFile, categoryForExt, isHiddenLikeName } = fileClassifier;

describe('classifyFile', () => {
  it('files with no extension go to a dedicated bucket', () => {
    const res = classifyFile('Makefile');
    expect(res.category).toBe('No Extension');
    expect(res.targetSegments).toContain('No Extension');
  });

  it('classifies documents and subdivides by default', () => {
    const res = classifyFile('report.pdf');
    expect(res.category).toBe('Documents');
    expect(res.categoryPath.startsWith('Documents/')).toBe(true);
  });

  it('honours subdivideDocuments: false', () => {
    const res = classifyFile('report.pdf', { subdivideDocuments: false });
    expect(res.category).toBe('Documents');
    expect(res.categoryPath).toBe('Documents');
    expect(res.targetSegments).toEqual(['Documents']);
  });

  it('unknown extensions fall back to Others', () => {
    const res = classifyFile('thing.zzz');
    expect(res.category).toBe('Others');
  });

  it('always returns the normalized extension', () => {
    expect(classifyFile('IMG.PNG').ext.toLowerCase()).toBe('.png');
  });
});

describe('categoryForExt', () => {
  it('derives a category from a bare extension', () => {
    expect(categoryForExt('.pdf')).toBe('Documents');
    expect(categoryForExt('')).toBe('No Extension');
  });
});

describe('isHiddenLikeName', () => {
  it('flags dotfiles but not the relative dirs', () => {
    expect(isHiddenLikeName('.env')).toBe(true);
    expect(isHiddenLikeName('.')).toBe(false);
    expect(isHiddenLikeName('..')).toBe(false);
    expect(isHiddenLikeName('readme.md')).toBe(false);
  });
});
