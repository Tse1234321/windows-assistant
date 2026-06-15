import React, { useEffect, useState } from 'react';
import Layout from './components/Layout.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Modes from './pages/Modes.jsx';
import FileOrganizer from './pages/FileOrganizer.jsx';
import Screenshots from './pages/Screenshots.jsx';
import Rules from './pages/Rules.jsx';
import HealthMonitor from './pages/HealthMonitor.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Result pushed from the tray "寫程式模式" action, so the Modes page can show it.
  const [externalModeResult, setExternalModeResult] = useState(null);

  useEffect(() => {
    if (!window.api) return undefined;

    const offNavigate = window.api.onNavigate((target) => {
      if (target) setPage(target);
    });
    const offModeResult = window.api.onModeResult((result) => {
      setExternalModeResult(result);
      setPage('modes');
    });
    const offPalette = window.api.onOpenCommandPalette(() => {
      setPaletteOpen(true);
    });

    return () => {
      offNavigate && offNavigate();
      offModeResult && offModeResult();
      offPalette && offPalette();
    };
  }, []);

  // Renderer-side fallback for Ctrl+Shift+P when the window already has focus.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (key) => setPage(key);

  const renderPage = () => {
    switch (page) {
      case 'projects':
        return <Projects />;
      case 'modes':
        return <Modes externalResult={externalModeResult} />;
      case 'files':
        return <FileOrganizer />;
      case 'screenshots':
        return <Screenshots />;
      case 'rules':
        return <Rules />;
      case 'health':
        return <HealthMonitor />;
      case 'settings':
        return <Settings />;
      case 'dashboard':
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <>
      <Layout current={page} onNavigate={navigate}>
        {renderPage()}
      </Layout>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
      />
    </>
  );
}
