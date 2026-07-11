import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '../../utils/format.js';
import { normalizeNodeSearch, scoreDashboardNode } from './globeLayout.js';

const FILE_KIND_MAP = [
  [['.pdf'], 'doc', 'PDF'],
  [['.doc', '.docx', '.rtf', '.txt', '.md'], 'doc', 'DOC'],
  [['.xls', '.xlsx', '.csv'], 'sheet', 'XLS'],
  [['.ppt', '.pptx'], 'doc', 'PPT'],
  [['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'], 'img', 'IMG'],
  [['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.flac'], 'media', 'MEDIA'],
  [['.zip', '.rar', '.7z', '.tar', '.gz'], 'zip', 'ZIP'],
  [
    [
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.mjs',
      '.cjs',
      '.py',
      '.java',
      '.cpp',
      '.c',
      '.h',
      '.cs',
      '.go',
      '.rs',
      '.html',
      '.css',
      '.json',
      '.yml',
      '.yaml',
      '.ps1',
      '.sh',
    ],
    'code',
    'CODE',
  ],
];

function statusLabel(t, status) {
  if (status === 'good') return t('dashboard.good');
  if (status === 'warning') return t('dashboard.attention');
  if (status === 'danger') return t('dashboard.danger');
  return t('dashboard.normal');
}

function describeAmount(node, t) {
  if (!node || node.meta?.unavailable) return t('dashboard.unavailable');
  const parts = [];
  if (node.count != null)
    parts.push(`${new Intl.NumberFormat().format(node.count)} ${t('dashboard.files')}`);
  if (node.sizeBytes != null) parts.push(formatBytes(node.sizeBytes));
  if (!parts.length && node.value != null) parts.push(new Intl.NumberFormat().format(node.value));
  return parts.join(' / ') || t('dashboard.unavailable');
}

function fileKind(extension) {
  const value = String(extension || '').toLowerCase();
  for (const [extensions, className, label] of FILE_KIND_MAP) {
    if (extensions.includes(value)) return { className, label };
  }
  const raw = value.replace('.', '').toUpperCase();
  return { className: 'file', label: raw ? raw.slice(0, 4) : 'FILE' };
}

function previewMessage(t, code) {
  if (code === 'outside_authorized_root' || code === 'invalid_node' || code === 'invalid_request')
    return t('dashboard.corePreviewDenied');
  if (code === 'not_found') return t('dashboard.corePreviewMissing');
  if (code === 'too_large') return t('dashboard.corePreviewTooLarge');
  if (code === 'binary') return t('dashboard.corePreviewBinary');
  if (code === 'read_failed' || code === 'access_denied')
    return t('dashboard.corePreviewReadFailed');
  return t('dashboard.corePreviewUnavailable');
}

function DirListing({ nodeId, depth, t }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    folders: [],
    files: [],
    truncated: false,
  });
  const [openFolders, setOpenFolders] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    setOpenFolders(new Set());
    const request = window.api?.browseDashboardNode?.({ nodeId });
    if (!request) {
      setState({
        loading: false,
        error: t('dashboard.browseFailed'),
        folders: [],
        files: [],
        truncated: false,
      });
      return undefined;
    }

    request
      .then((result) => {
        if (!alive) return;
        setState(
          result?.ok
            ? {
                loading: false,
                error: '',
                folders: result.folders || [],
                files: result.files || [],
                truncated: Boolean(result.truncated),
              }
            : {
                loading: false,
                error: result?.message || result?.error || t('dashboard.browseFailed'),
                folders: [],
                files: [],
                truncated: false,
              },
        );
      })
      .catch((error) => {
        if (alive)
          setState({
            loading: false,
            error: error.message,
            folders: [],
            files: [],
            truncated: false,
          });
      });

    return () => {
      alive = false;
    };
  }, [nodeId, t]);

  if (state.loading) return <div className="tree-note">{t('dashboard.loadingContents')}</div>;
  if (state.error) return <div className="tree-note tree-note-error">{state.error}</div>;
  if (!state.folders.length && !state.files.length)
    return <div className="tree-note">{t('dashboard.emptyFolder')}</div>;

  const toggleFolder = (folderId) => {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <ul className="globe-tree-list">
      {state.folders.map((folder) => {
        const isOpen = openFolders.has(folder.id);
        return (
          <li key={folder.path}>
            <button
              type="button"
              className="tree-row tree-row-folder"
              onClick={() => toggleFolder(folder.id)}
              disabled={depth >= 4}
              title={folder.path}
              aria-expanded={isOpen}
            >
              <i className={`tree-caret${isOpen ? ' tree-caret-open' : ''}`} />
              <span className="tree-glyph-folder" />
              <span className="tree-name">{folder.name}</span>
              {folder.itemCount != null ? <em>{folder.itemCount}</em> : null}
            </button>
            {isOpen ? (
              <div className="tree-children">
                <DirListing nodeId={folder.id} depth={depth + 1} t={t} />
              </div>
            ) : null}
          </li>
        );
      })}
      {state.files.map((file) => {
        const kind = fileKind(file.ext);
        return (
          <li key={file.path}>
            <button
              type="button"
              className="tree-row tree-row-file"
              onClick={() => window.api?.revealDashboardNode?.({ nodeId: file.id })}
              title={file.path}
            >
              <span className={`tree-chip tree-chip-${kind.className}`}>{kind.label}</span>
              <span className="tree-file-main">
                <span className="tree-name">{file.name}</span>
                <span className="tree-meta">
                  {file.sizeBytes != null ? formatBytes(file.sizeBytes) : '--'}
                  {file.updatedAt ? ` · ${new Date(file.updatedAt).toLocaleDateString()}` : ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
      {state.truncated ? <li className="tree-note">{t('dashboard.moreItems')}</li> : null}
    </ul>
  );
}

export default function GlobeNodePanel({
  groups,
  nodes,
  activeGroupId,
  onGroupChange,
  selectedNode,
  onNodeSelect,
  onNodeClear,
  onNodeOpen,
  onNodeExplore,
  searchText = '',
  onSearchTextChange,
  browseState,
  t,
  language,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [folderSearch, setFolderSearch] = useState({
    query: '',
    loading: false,
    nodes: [],
    error: '',
  });
  const [preview, setPreview] = useState({ status: 'idle', nodeId: '', result: null });
  const previewRequestRef = useRef(0);
  const selectedIsFolder = Boolean(
    selectedNode &&
    (selectedNode.kind === 'folder' ||
      selectedNode.meta?.folder ||
      selectedNode.type === 'project'),
  );

  useEffect(() => {
    const requestId = ++previewRequestRef.current;
    if (!selectedNode?.id || selectedIsFolder) {
      setPreview({ status: 'idle', nodeId: '', result: null });
      return undefined;
    }
    if (!window.api?.previewDashboardNode) {
      setPreview({
        status: 'unsupported',
        nodeId: selectedNode.id,
        result: { code: 'unsupported_type' },
      });
      return undefined;
    }

    setPreview({ status: 'loading', nodeId: selectedNode.id, result: null });
    window.api
      .previewDashboardNode({ nodeId: selectedNode.id })
      .then((result) => {
        if (previewRequestRef.current !== requestId) return;
        setPreview({
          status: result?.ok ? 'ready' : 'unsupported',
          nodeId: selectedNode.id,
          result,
        });
      })
      .catch(() => {
        if (previewRequestRef.current !== requestId) return;
        setPreview({
          status: 'error',
          nodeId: selectedNode.id,
          result: { code: 'read_failed' },
        });
      });

    return () => {
      if (previewRequestRef.current === requestId) previewRequestRef.current += 1;
    };
  }, [selectedIsFolder, selectedNode?.id]);

  useEffect(() => {
    const query = normalizeNodeSearch(searchText);
    if (!query || !window.api?.searchDashboardFolders) {
      setFolderSearch({ query, loading: false, nodes: [], error: '' });
      return undefined;
    }

    let alive = true;
    setFolderSearch({ query, loading: true, nodes: [], error: '' });
    const timer = window.setTimeout(() => {
      window.api
        .searchDashboardFolders(searchText)
        .then((result) => {
          if (!alive) return;
          setFolderSearch({
            query,
            loading: false,
            nodes: result?.ok ? result.nodes || [] : [],
            error: result?.ok ? '' : result?.error || '',
          });
        })
        .catch((error) => {
          if (alive) setFolderSearch({ query, loading: false, nodes: [], error: error.message });
        });
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [searchText]);

  const searchResults = useMemo(() => {
    const query = normalizeNodeSearch(searchText);
    if (!query) return [];
    const local = nodes
      .map((node) => ({ node, score: scoreDashboardNode(node, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.node);
    const remote = folderSearch.query === query ? folderSearch.nodes : [];
    const seen = new Set();
    return [...local, ...remote]
      .filter((node) => {
        const key = normalizeNodeSearch(node?.path) || String(node?.id || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [folderSearch.nodes, folderSearch.query, nodes, searchText]);

  useEffect(() => {
    setActiveSearchIndex((current) => Math.min(current, Math.max(0, searchResults.length - 1)));
  }, [searchResults.length]);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const selectNode = (node) => {
    if (!node) return;
    onGroupChange(node.type || 'other');
    onNodeSelect(node);
    setSearchOpen(false);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchIndex((current) => Math.min(current + 1, searchResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchIndex((current) => Math.max(0, current - 1));
    } else if (event.key === 'Escape') {
      setSearchOpen(false);
      onSearchTextChange?.('');
    }
  };

  return (
    <div className={`globe-information-layer${selectedNode ? ' has-selection' : ''}`}>
      <section className="globe-data-index" aria-label={t('dashboard.coreDirectory')}>
        <form
          className="globe-node-search-box"
          onSubmit={(event) => {
            event.preventDefault();
            selectNode(searchResults[activeSearchIndex] || searchResults[0]);
          }}
        >
          <label className="sr-only" htmlFor="globe-node-search-input">
            {t('dashboard.coreSearch')}
          </label>
          <span className="globe-node-search-mark" aria-hidden="true" />
          <input
            id="globe-node-search-input"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen && Boolean(searchText.trim())}
            aria-controls="globe-node-search-results"
            aria-activedescendant={
              searchOpen && searchResults.length
                ? `globe-search-result-${activeSearchIndex}`
                : undefined
            }
            value={searchText}
            placeholder={t('dashboard.coreSearchPlaceholder')}
            autoComplete="off"
            autoFocus
            onChange={(event) => {
              onSearchTextChange?.(event.target.value);
              setSearchOpen(true);
              setActiveSearchIndex(0);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
          />
          {searchText ? (
            <button
              type="button"
              className="globe-node-search-clear"
              onClick={() => {
                onSearchTextChange?.('');
                setSearchOpen(false);
              }}
              aria-label={t('dashboard.coreClearSearch')}
            >
              ×
            </button>
          ) : (
            <span className="globe-node-search-hint">Enter</span>
          )}
        </form>

        {searchOpen && searchText.trim() ? (
          <div id="globe-node-search-results" className="globe-node-search-results" role="listbox">
            {searchResults.length ? (
              searchResults.map((node, index) => (
                <button
                  key={node.path || node.id}
                  id={`globe-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSearchIndex}
                  className={index === activeSearchIndex ? 'active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSearchIndex(index)}
                  onClick={() => selectNode(node)}
                >
                  <span>
                    <strong>{node.label}</strong>
                    <em>{node.path || node.type}</em>
                  </span>
                  <i className={`status-text-${node.status}`}>{statusLabel(t, node.status)}</i>
                </button>
              ))
            ) : (
              <div className="globe-node-search-empty">
                {folderSearch.loading
                  ? t('dashboard.coreSearching')
                  : folderSearch.error || t('dashboard.coreNoResults')}
              </div>
            )}
          </div>
        ) : null}

        <div
          className="globe-group-tabs globe-data-tree"
          role="tablist"
          aria-label={t('dashboard.coreGroups')}
        >
          {groups.map((group, groupIndex) => {
            const groupColor = `#${group.color.toString(16).padStart(6, '0')}`;
            const panelId = `globe-node-panel-${groupIndex}`;
            return (
              <section
                key={group.id}
                className={`globe-data-tree-group${group.id === activeGroup?.id ? ' active' : ''}`}
                style={{ '--group-color': groupColor }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={group.id === activeGroup?.id}
                  aria-controls={panelId}
                  className="globe-data-tree-heading"
                  onClick={() => onGroupChange(group.id)}
                >
                  <span className="globe-data-tree-index">
                    {String(groupIndex + 1).padStart(2, '0')}
                  </span>
                  <i aria-hidden="true" />
                  <span>{t(group.labelKey)}</span>
                  <em>{group.nodes.length}</em>
                </button>
                <div id={panelId} className="globe-node-list globe-data-tree-nodes" role="tabpanel">
                  {group.nodes.slice(0, 6).map((node) => {
                    const isFolder = node.kind === 'folder' || node.meta?.folder === true;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={selectedNode?.id === node.id ? 'active' : ''}
                        aria-pressed={selectedNode?.id === node.id}
                        onClick={() => selectNode(node)}
                      >
                        <span className="globe-data-tree-branch" aria-hidden="true" />
                        <span
                          className={`globe-tree-kind ${isFolder ? 'is-folder' : 'is-file'}`}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{node.label}</strong>
                          <em>{describeAmount(node, t)}</em>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {selectedNode ? (
        <aside className="globe-detail-panel" aria-live="polite" aria-label={selectedNode.label}>
          <header>
            <span>{selectedNode.type}</span>
            <button type="button" onClick={onNodeClear} aria-label={t('dashboard.coreCloseNode')}>
              ×
            </button>
          </header>
          <strong>{selectedNode.label}</strong>
          <dl>
            <div>
              <dt>{t('dashboard.status')}</dt>
              <dd className={`status-text-${selectedNode.status}`}>
                {statusLabel(t, selectedNode.status)}
              </dd>
            </div>
            <div>
              <dt>{t('dashboard.size')}</dt>
              <dd>{describeAmount(selectedNode, t)}</dd>
            </div>
            <div>
              <dt>{t('dashboard.updated')}</dt>
              <dd>
                {selectedNode.updatedAt
                  ? new Date(selectedNode.updatedAt).toLocaleString(language)
                  : t('dashboard.unavailable')}
              </dd>
            </div>
          </dl>
          {selectedNode.path && selectedIsFolder ? (
            <div className="globe-file-tree">
              <div className="globe-file-tree-head">
                <span>{t('dashboard.nodeContents')}</span>
                <button
                  type="button"
                  onClick={() => window.api?.revealDashboardNode?.({ nodeId: selectedNode.id })}
                >
                  {t('dashboard.openFolder')}
                </button>
              </div>
              <div className="globe-file-tree-body">
                <DirListing nodeId={selectedNode.id} depth={0} t={t} />
              </div>
            </div>
          ) : null}
          {!selectedIsFolder ? (
            <div className="globe-file-preview" data-preview-state={preview.status}>
              <header>
                <span>{t('dashboard.coreFilePreview')}</span>
                <button
                  type="button"
                  onClick={() => window.api?.revealDashboardNode?.({ nodeId: selectedNode.id })}
                >
                  {t('dashboard.coreRevealFile')}
                </button>
              </header>
              {preview.status === 'loading' ? (
                <div className="globe-preview-message" role="status">
                  {t('dashboard.corePreviewLoading')}
                </div>
              ) : null}
              {preview.status === 'ready' && preview.result?.kind === 'text' ? (
                <>
                  <pre tabIndex="0">{preview.result.content}</pre>
                  {preview.result.truncated ? (
                    <p className="globe-preview-truncated">{t('dashboard.corePreviewTruncated')}</p>
                  ) : null}
                </>
              ) : null}
              {preview.status === 'ready' && preview.result?.kind === 'image' ? (
                <img src={preview.result.dataUrl} alt={selectedNode.label} />
              ) : null}
              {preview.status === 'unsupported' || preview.status === 'error' ? (
                <div className="globe-preview-message" role="status">
                  <strong>{t('dashboard.corePreviewUnsupported')}</strong>
                  <span>{previewMessage(t, preview.result?.code)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {browseState?.loading ? (
            <div className="globe-explore-status" role="status">
              {t('dashboard.loadingContents')}
            </div>
          ) : null}
          {browseState?.error ? (
            <div className="globe-explore-status is-error" role="alert">
              {browseState.error}
            </div>
          ) : null}
          {selectedNode.path && selectedIsFolder ? (
            <button
              type="button"
              className="globe-explore-button"
              onClick={() => {
                onSearchTextChange?.('');
                onNodeExplore?.(selectedNode);
              }}
              disabled={browseState?.loading}
            >
              {t('dashboard.coreExploreNode')}
            </button>
          ) : null}
          <button
            type="button"
            className="globe-open-button"
            onClick={() => onNodeOpen?.(selectedNode)}
            disabled={!selectedNode.route}
          >
            {t('dashboard.coreOpenNode')}
          </button>
        </aside>
      ) : null}
    </div>
  );
}
