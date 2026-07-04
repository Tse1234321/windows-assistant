import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button.jsx';
import { formatBytes } from './cleanupShared.js';

const THEME_VARS = [
  '--ee-accent',
  '--ee-neon',
  '--ee-neon-glow',
  '--ee-ink',
  '--ee-ink-dim',
  '--ee-ink-faint',
  '--ee-card',
];

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function placementOrder(preferred) {
  const orders = {
    right: ['right', 'bottom', 'left', 'top'],
    left: ['left', 'bottom', 'right', 'top'],
    bottom: ['bottom', 'right', 'left', 'top'],
    top: ['top', 'right', 'left', 'bottom'],
  };
  return orders[preferred] || orders.right;
}

function rawPosition(placement, anchorRect, popoverRect, gap) {
  const centerX = anchorRect.left + anchorRect.width / 2;
  const centerY = anchorRect.top + anchorRect.height / 2;
  if (placement === 'right') {
    return {
      left: anchorRect.right + gap,
      top: centerY - popoverRect.height / 2,
    };
  }
  if (placement === 'left') {
    return {
      left: anchorRect.left - popoverRect.width - gap,
      top: centerY - popoverRect.height / 2,
    };
  }
  if (placement === 'top') {
    return {
      left: centerX - popoverRect.width / 2,
      top: anchorRect.top - popoverRect.height - gap,
    };
  }
  return {
    left: centerX - popoverRect.width / 2,
    top: anchorRect.bottom + gap,
  };
}

function overflowAmount(pos, popoverRect, viewport, margin) {
  const right = pos.left + popoverRect.width;
  const bottom = pos.top + popoverRect.height;
  return (
    Math.max(0, margin - pos.left) +
    Math.max(0, margin - pos.top) +
    Math.max(0, right - (viewport.width - margin)) +
    Math.max(0, bottom - (viewport.height - margin))
  );
}

export default function CleanConfirmPopover({
  open,
  anchorRef,
  title,
  count,
  size,
  note,
  placement = 'right',
  busy,
  onCancel,
  actions = [],
}) {
  const ref = useRef(null);
  const [floatingStyle, setFloatingStyle] = useState(null);
  const [actualPlacement, setActualPlacement] = useState(placement);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current;
    const popover = ref.current;
    if (!anchor || !popover) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = {
      width: popover.offsetWidth || 320,
      height: popover.offsetHeight || 160,
    };
    const viewport = {
      width: window.innerWidth || document.documentElement.clientWidth,
      height: window.innerHeight || document.documentElement.clientHeight,
    };
    const gap = 12;
    const margin = 12;
    let best = null;

    for (const candidate of placementOrder(placement)) {
      const pos = rawPosition(candidate, anchorRect, popoverRect, gap);
      const overflow = overflowAmount(pos, popoverRect, viewport, margin);
      const entry = { placement: candidate, pos, overflow };
      if (!best || overflow < best.overflow) best = entry;
      if (overflow === 0) break;
    }

    const source = anchor.closest('.ee-tech');
    const computed = source ? window.getComputedStyle(source) : null;
    const themeVars = {};
    if (computed) {
      THEME_VARS.forEach((name) => {
        const value = computed.getPropertyValue(name);
        if (value) themeVars[name] = value.trim();
      });
    }

    setActualPlacement(best.placement);
    setFloatingStyle({
      ...themeVars,
      left: `${clamp(best.pos.left, margin, viewport.width - popoverRect.width - margin)}px`,
      top: `${clamp(best.pos.top, margin, viewport.height - popoverRect.height - margin)}px`,
    });
  }, [anchorRef, placement]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    setFloatingStyle(null);
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocPointerDown = (event) => {
      const target = event.target;
      if (ref.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onCancel();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    const onReposition = () => updatePosition();

    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [anchorRef, onCancel, open, updatePosition]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`cc-confirm-pop placement-${actualPlacement}`}
      ref={ref}
      role="dialog"
      aria-modal="false"
      style={{ ...floatingStyle, visibility: floatingStyle ? 'visible' : 'hidden' }}
    >
      <strong className="cc-confirm-title">{title}</strong>
      <div className="cc-confirm-summary">
        <div>
          <span>即將清理</span>
          <strong>{count} 個檔案</strong>
        </div>
        <div>
          <span>預估釋放</span>
          <strong>{formatBytes(size)}</strong>
        </div>
      </div>
      {note ? <p className="cc-confirm-note">{note}</p> : null}
      <div className="cc-confirm-actions">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        {actions.map((action) => (
          <Button
            size="sm"
            key={action.label}
            variant={action.variant || 'primary'}
            disabled={busy || action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
