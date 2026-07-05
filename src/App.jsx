import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import AppShell from './layout/AppShell.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { LocaleProvider } from './i18n.jsx';
import Dashboard from './pages/Dashboard.jsx';
import OverlayApp from './overlay/OverlayApp.jsx';

// Pages are lazy-loaded so heavier tools don't inflate the startup bundle.
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Modes = lazy(() => import('./pages/Modes.jsx'));
const FileOrganizer = lazy(() => import('./pages/FileOrganizer.jsx'));
const Automations = lazy(() => import('./pages/Automations.jsx'));
const WorkflowEditor = lazy(() => import('./pages/WorkflowEditor.tsx'));
const SystemMonitor = lazy(() => import('./pages/SystemMonitor.jsx'));
const Screenshots = lazy(() => import('./pages/Screenshots.jsx'));
const Rules = lazy(() => import('./pages/Rules.jsx'));
const HealthMonitor = lazy(() => import('./pages/HealthMonitor.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CleanCenter = lazy(() => import('./pages/CleanCenter.jsx'));
const SecurityCenter = lazy(() => import('./pages/SecurityCenter.tsx'));
const SetupWizard = lazy(() => import('./pages/SetupWizard.jsx'));
const WorkspaceTemplates = lazy(() => import('./pages/WorkspaceTemplates.jsx'));
const NotificationCenter = lazy(() => import('./pages/NotificationCenter.jsx'));
const ActivityHistory = lazy(() => import('./pages/ActivityHistory.jsx'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage.jsx'));
const CommandCheatsheet = lazy(() => import('./pages/CommandCheatsheet.jsx'));
const ToolchainDoctor = lazy(() => import('./pages/ToolchainDoctor.jsx'));
const EETools = lazy(() => import('./pages/EETools.jsx'));
const EmbeddedLab = lazy(() => import('./pages/EmbeddedLab.jsx'));

function PageFallback() {
  return (
    <div className="loading-block">
      <span className="spinner" aria-hidden="true" />
      <span>Loading…</span>
    </div>
  );
}

function Shell() {
  const [page, setPage] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [externalModeResult, setExternalModeResult] = useState(null);
  // Back/forward navigation stack (like a browser): stack of visited pages + cursor.
  const historyRef = useRef({ stack: ['dashboard'], index: 0 });
  const [historyState, setHistoryState] = useState({ canBack: false, canForward: false });

  const syncHistoryState = () => {
    const { stack, index } = historyRef.current;
    setHistoryState({ canBack: index > 0, canForward: index < stack.length - 1 });
  };

  const navigate = useCallback((key) => {
    if (!key) return;
    const target = key === 'downloads' ? 'files' : key;
    const history = historyRef.current;
    if (history.stack[history.index] !== target) {
      history.stack = [...history.stack.slice(0, history.index + 1), target];
      // Cap the stack so an all-day session doesn't grow it unbounded.
      if (history.stack.length > 50) history.stack = history.stack.slice(-50);
      history.index = history.stack.length - 1;
      syncHistoryState();
    }
    setPage(target);
    setPaletteOpen(false);
  }, []);

  const goBack = useCallback(() => {
    const history = historyRef.current;
    if (history.index <= 0) return;
    history.index -= 1;
    syncHistoryState();
    setPage(history.stack[history.index]);
  }, []);

  const goForward = useCallback(() => {
    const history = historyRef.current;
    if (history.index >= history.stack.length - 1) return;
    history.index += 1;
    syncHistoryState();
    setPage(history.stack[history.index]);
  }, []);

  useEffect(() => {
    if (!window.api) return undefined;
    const offNavigate = window.api.onNavigate((target) => {
      if (target) navigate(target);
    });
    const offModeResult = window.api.onModeResult((result) => {
      setExternalModeResult(result);
      navigate('modes');
    });
    const offPalette = window.api.onOpenCommandPalette(() => setPaletteOpen(true));
    return () => {
      offNavigate && offNavigate();
      offModeResult && offModeResult();
      offPalette && offPalette();
    };
  }, [navigate]);

  useEffect(() => {
    if (!window.api?.getSetupStatus) return;
    window.api
      .getSetupStatus()
      .then((result) => {
        if (result?.ok && !result.complete) navigate('setup');
      })
      .catch(() => {});
    // navigate is stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: Ctrl+K / Ctrl+Alt+Shift+N toggle the palette, Alt+←/→ navigate history.
  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      const commandSearch = (e.ctrlKey || e.metaKey) && k === 'k';
      const globalPalette = (e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && k === 'n';
      if (commandSearch || globalPalette) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goBack();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goForward();
        }
      }
    };
    // Mouse side buttons (XButton1/XButton2) act like browser back/forward.
    const onMouseUp = (e) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [goBack, goForward]);

  const renderPage = () => {
    switch (page) {
      case 'projects':
        return <Projects onNavigate={navigate} />;
      case 'modes':
        return <Modes externalResult={externalModeResult} />;
      case 'files':
      case 'downloads':
        return <FileOrganizer />;
      case 'cleanup':
        return <CleanCenter onNavigate={navigate} />;
      case 'security':
        return <SecurityCenter />;
      case 'setup':
        return <SetupWizard onNavigate={navigate} />;
      case 'workspaceTemplates':
        return <WorkspaceTemplates onNavigate={navigate} />;
      case 'cheatsheet':
        return <CommandCheatsheet />;
      case 'toolchain':
        return <ToolchainDoctor />;
      case 'eeTools':
        return <EETools />;
      case 'embedded':
        return <EmbeddedLab />;
      case 'automations':
        return <Automations onNavigate={navigate} />;
      case 'workflows':
        return <WorkflowEditor onNavigate={navigate} />;
      case 'monitor':
        return <SystemMonitor onNavigate={navigate} />;
      case 'screenshots':
        return <Screenshots />;
      case 'rules':
        return <Rules />;
      case 'health':
        return <HealthMonitor />;
      case 'notifications':
        return <NotificationCenter onNavigate={navigate} />;
      case 'history':
        return <ActivityHistory />;
      case 'updates':
        return <UpdatesPage />;
      case 'settings':
        return <Settings />;
      case 'dashboard':
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <>
      <AppShell
        current={page}
        onNavigate={navigate}
        onOpenPalette={() => setPaletteOpen(true)}
        onBack={goBack}
        onForward={goForward}
        canBack={historyState.canBack}
        canForward={historyState.canForward}
      >
        <div className="page-transition" key={page}>
          <Suspense fallback={<PageFallback />}>{renderPage()}</Suspense>
        </div>
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
      />
    </>
  );
}

export default function App() {
  const isOverlay =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('overlay') === '1';

  if (isOverlay) {
    return <OverlayApp />;
  }

  return (
    <ThemeProvider>
      <LocaleProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
