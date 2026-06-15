import React, { useEffect, useState } from 'react';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Modes from './pages/Modes.jsx';
import FileOrganizer from './pages/FileOrganizer.jsx';
import HealthMonitor from './pages/HealthMonitor.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [page, setPage] = useState('dashboard');
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

    return () => {
      offNavigate && offNavigate();
      offModeResult && offModeResult();
    };
  }, []);

  const navigate = (key) => setPage(key);

  const renderPage = () => {
    switch (page) {
      case 'modes':
        return <Modes externalResult={externalModeResult} />;
      case 'files':
        return <FileOrganizer />;
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
    <Layout current={page} onNavigate={navigate}>
      {renderPage()}
    </Layout>
  );
}
