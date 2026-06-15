import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Command Palette overlay. Commands come from the main-process registry
 * (commandService) via window.api.listCommands(). Selecting one runs it through
 * window.api.runCommand(); navigation directives are handed back to the app.
 */
export default function CommandPalette({ open, onClose, onNavigate }) {
  const [commands, setCommands] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [toast, setToast] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open || !window.api) return;
    setQuery('');
    setActive(0);
    setToast('');
    window.api.listCommands().then((res) => setCommands(res.commands || []));
    // Focus the search box once the overlay is shown.
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const haystack = `${c.title} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase();
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [commands, query]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered, active]);

  const run = async (command) => {
    if (!command) return;
    const res = await window.api.runCommand(command.id);
    if (res && res.navigate) {
      onNavigate(res.navigate);
      onClose();
      return;
    }
    if (res && res.ok) {
      onClose();
    } else {
      setToast(res && res.error ? res.error : '執行失敗');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(filtered[active]);
    }
  };

  if (!open) return null;

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="輸入指令… (↑ ↓ 選擇，Enter 執行，Esc 關閉)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <ul className="palette-list">
          {filtered.length === 0 ? (
            <li className="palette-empty">沒有符合的指令</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                className={`palette-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
              >
                <span className="palette-title">{c.title}</span>
                {c.hint ? <span className="palette-hint">{c.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
        {toast ? <div className="toast error" style={{ margin: '0 12px 12px' }}>{toast}</div> : null}
      </div>
    </div>
  );
}
