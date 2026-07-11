import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adaptDashboardNodes } from './globeLayout.js';

function hashPath(value) {
  let hash = 2166136261;
  const normalized = String(value || '')
    .replace(/\\/g, '/')
    .toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function adaptBrowseResult(result, parentNode) {
  if (!result?.ok) return [];
  const parentId = String(parentNode?.id || 'dashboard-root');
  const folders = (result.folders || []).map((folder) => ({
    ...folder,
    id: folder.id || `folder-${hashPath(folder.path)}`,
    label: folder.name,
    type: 'file',
    kind: 'folder',
    status: 'normal',
    value: Math.max(1, Number(folder.itemCount || 1)),
    parentId,
    meta: { folder: true, itemCount: folder.itemCount },
  }));
  const files = (result.files || []).map((file) => ({
    ...file,
    id: file.id || `file-${hashPath(file.path)}`,
    label: file.name,
    type: 'file',
    kind: 'file',
    status: 'normal',
    value: Math.max(1, Number(file.sizeBytes || 1)),
    parentId,
    meta: { extension: file.ext, sizeBytes: file.sizeBytes },
  }));
  return adaptDashboardNodes([...folders, ...files]);
}

export function useDashboardNodeExplorer({ rootNodes, selectedNode, onNodeSelect, onNodeClear }) {
  const normalizedRoot = useMemo(() => adaptDashboardNodes(rootNodes), [rootNodes]);
  const [scopes, setScopes] = useState([]);
  const [scopeNodes, setScopeNodes] = useState(normalizedRoot);
  const [browseState, setBrowseState] = useState({ loading: false, error: '', truncated: false });
  const requestRef = useRef(0);

  useEffect(() => {
    if (!scopes.length) setScopeNodes(normalizedRoot);
  }, [normalizedRoot, scopes.length]);

  const selectSceneNode = useCallback(
    (node) => {
      if (!node) return;
      setScopeNodes((current) =>
        current.some((candidate) => candidate.id === node.id)
          ? current
          : adaptDashboardNodes([...current, node]),
      );
      onNodeSelect?.(node);
    },
    [onNodeSelect],
  );

  const enterFolder = useCallback(
    async (node) => {
      if (!node?.id || !window.api?.browseDashboardNode) return false;
      const requestId = ++requestRef.current;
      setBrowseState({ loading: true, error: '', truncated: false });
      try {
        const result = await window.api.browseDashboardNode({ nodeId: node.id });
        if (requestId !== requestRef.current) return false;
        if (!result?.ok) {
          setBrowseState({
            loading: false,
            error: result?.message || result?.error || 'Unable to read this folder.',
            truncated: false,
          });
          return false;
        }
        const children = adaptBrowseResult(result, node);
        setScopes((current) => [
          ...current,
          { id: node.id, label: node.label, path: node.path, nodes: scopeNodes },
        ]);
        setScopeNodes(children);
        setBrowseState({ loading: false, error: '', truncated: Boolean(result.truncated) });
        onNodeClear?.();
        return true;
      } catch (error) {
        if (requestId === requestRef.current) {
          setBrowseState({
            loading: false,
            error: error?.message || 'Unable to read this folder.',
            truncated: false,
          });
        }
        return false;
      }
    },
    [onNodeClear, scopeNodes],
  );

  const goBack = useCallback(() => {
    requestRef.current += 1;
    setScopes((current) => {
      const previous = current.at(-1);
      setScopeNodes(previous?.nodes || normalizedRoot);
      return current.slice(0, -1);
    });
    setBrowseState({ loading: false, error: '', truncated: false });
    onNodeClear?.();
  }, [normalizedRoot, onNodeClear]);

  const resetExplorer = useCallback(() => {
    requestRef.current += 1;
    setScopes([]);
    setScopeNodes(normalizedRoot);
    setBrowseState({ loading: false, error: '', truncated: false });
    onNodeClear?.();
  }, [normalizedRoot, onNodeClear]);

  return {
    sceneNodes: scopeNodes,
    selectedNode,
    selectSceneNode,
    enterFolder,
    goBack,
    resetExplorer,
    canGoBack: scopes.length > 0,
    breadcrumbs: [{ id: 'overview', label: 'Overview', path: '' }, ...scopes],
    currentScope: scopes.at(-1) || null,
    browseState,
  };
}
