// Pure helpers for Project Hub list filtering & sorting. No DOM, no side effects
// — extracted from Projects.jsx so they can be unit tested and reused.

export function normalizePath(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/** Whether a project passes the active status filter. */
export function matchesStatus(project, filter, workspacePaths) {
  if (filter === 'pinned') return workspacePaths.has(normalizePath(project.path));
  if (filter === 'git') return project.isGitRepo;
  if (filter === 'dirty') return project.modifiedCount > 0;
  if (filter === 'folder') return project.exists && !project.isGitRepo;
  if (filter === 'missing') return !project.exists;
  return true;
}

/**
 * Sort a project list. Pinned (workspace) projects always float to the top; the
 * remaining order is driven by sortKey ('name' | 'category' | 'modified' |
 * default 'score' by weight). Returns a new array — the input is not mutated.
 */
export function sortProjects(items, sortKey, workspacePaths) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aPinned = workspacePaths.has(normalizePath(a.path));
    const bPinned = workspacePaths.has(normalizePath(b.path));
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    if (sortKey === 'name') return String(a.name).localeCompare(String(b.name), 'zh-Hant');
    if (sortKey === 'category') {
      const byCategory = String(a.category || '').localeCompare(
        String(b.category || ''),
        'zh-Hant',
      );
      return byCategory || String(a.name).localeCompare(String(b.name), 'zh-Hant');
    }
    if (sortKey === 'modified')
      return Date.parse(b.lastModified || 0) - Date.parse(a.lastModified || 0);
    return (
      (b.weight || 0) - (a.weight || 0) || String(a.name).localeCompare(String(b.name), 'zh-Hant')
    );
  });
  return sorted;
}
