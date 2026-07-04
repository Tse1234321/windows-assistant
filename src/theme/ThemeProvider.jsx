import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

// The app is dark-only: the cosmic background and globe are designed for a
// deep-space palette, so the old light/system theme modes were removed.
function applyToDocument(accent, compact) {
  const root = document.documentElement;
  root.setAttribute('data-theme', 'dark');
  root.setAttribute('data-compact', compact ? 'true' : 'false');
  if (accent) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-strong', accent);
  }
}

export function ThemeProvider({ children }) {
  const [accent, setAccentState] = useState('#22d3ee');
  const [compact, setCompactState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted appearance settings once.
  useEffect(() => {
    (async () => {
      try {
        if (window.api) {
          const res = await window.api.getSettings();
          const g = (res.settings && res.settings.general) || {};
          if (g.accentColor) setAccentState(g.accentColor);
          setCompactState(!!g.compactMode);
        }
      } catch (_) {
        /* fall back to defaults */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Apply on any change.
  useEffect(() => {
    applyToDocument(accent, compact);
  }, [accent, compact]);

  const persist = useCallback(async (patch) => {
    if (!window.api) return;
    try {
      const res = await window.api.getSettings();
      const next = { ...res.settings, general: { ...(res.settings.general || {}), ...patch } };
      await window.api.saveSettings(next);
    } catch (_) {
      /* ignore persistence errors */
    }
  }, []);

  const setAccent = useCallback(
    (a) => {
      setAccentState(a);
      persist({ accentColor: a });
    },
    [persist],
  );
  const setCompact = useCallback(
    (c) => {
      setCompactState(c);
      persist({ compactMode: c });
    },
    [persist],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme: 'dark',
        accent,
        compact,
        loaded,
        setAccent,
        setCompact,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
