import React, { useMemo } from 'react';
import Sidebar, { PAGE_TITLE_KEYS } from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { useLocale } from '../i18n.jsx';

function AppBackground() {
  const stars = useMemo(
    () =>
      Array.from({ length: 110 }, () => ({
        left: +(Math.random() * 100).toFixed(2),
        top: +(Math.random() * 100).toFixed(2),
        size: Math.random() < 0.8 ? 1 : 2,
        dur: 2.4 + Math.random() * 5,
        delay: -(Math.random() * 8).toFixed(2),
        peak: (0.4 + Math.random() * 0.55).toFixed(2),
      })),
    [],
  );
  const dots = useMemo(
    () =>
      Array.from({ length: 14 }, () => ({
        left: Math.round(Math.random() * 100),
        top: Math.round(Math.random() * 100),
        size: 2 + Math.round(Math.random() * 3),
        dur: 9 + Math.round(Math.random() * 11),
        delay: -Math.round(Math.random() * 16),
      })),
    [],
  );
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="nebula n1" />
      <div className="nebula n2" />
      <div className="nebula n3" />
      <div className="starfield">
        {stars.map((s, i) => (
          <i
            key={i}
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              '--twinkle-dur': `${s.dur}s`,
              '--twinkle-delay': `${s.delay}s`,
              '--twinkle-peak': s.peak,
            }}
          />
        ))}
      </div>
      <div className="particles">
        {dots.map((d, i) => (
          <i
            key={i}
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="shooting-star s1" />
      <div className="shooting-star s2" />
    </div>
  );
}

export default function AppShell({
  current,
  onNavigate,
  onOpenPalette,
  onBack,
  onForward,
  canBack,
  canForward,
  children,
}) {
  const { t } = useLocale();
  return (
    <div className="app-shell">
      <AppBackground />
      <Sidebar current={current} onNavigate={onNavigate} />
      <div className="app-main">
        <Topbar
          title={t(PAGE_TITLE_KEYS[current] || 'shell.brandCaption')}
          onOpenPalette={onOpenPalette}
          onNavigate={onNavigate}
          onBack={onBack}
          onForward={onForward}
          canBack={canBack}
          canForward={canForward}
        />
        <div className="content-scroll">{children}</div>
      </div>
    </div>
  );
}
