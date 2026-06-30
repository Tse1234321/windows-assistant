import React from 'react';
import StatusBadge from './StatusBadge.jsx';

type SecurityCardProps = {
  title: string;
  status: 'normal' | 'warning' | 'unavailable';
  value: string;
  detail?: string;
  reason?: string;
  recommendation?: string;
  deduction: number;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
};

function toneFor(status: SecurityCardProps['status']) {
  if (status === 'normal') return 'ok';
  if (status === 'warning') return 'warn';
  return 'danger';
}

function labelFor(status: SecurityCardProps['status']) {
  if (status === 'normal') return 'Normal';
  if (status === 'warning') return 'Warning';
  return 'Unknown';
}

export default function SecurityCard({
  title,
  status,
  value,
  detail,
  reason,
  recommendation,
  deduction,
  expanded,
  onToggle,
  action,
}: SecurityCardProps) {
  return (
    <article
      className={`security-card ${status} ${expanded ? 'expanded' : ''}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="security-card-head">
        <div>
          <span className="security-card-kicker">SECURITY SIGNAL</span>
          <h3>{title}</h3>
        </div>
        <StatusBadge tone={toneFor(status)}>{labelFor(status)}</StatusBadge>
      </div>
      <div className="security-card-main">
        <strong>{value}</strong>
        <span className={deduction > 0 ? 'deduction active' : 'deduction'}>
          {deduction > 0 ? `-${deduction}` : '0'} pts
        </span>
      </div>
      {detail ? <p>{detail}</p> : null}
      {expanded ? (
        <div className="security-card-details">
          <div>
            <span>可能原因</span>
            <p>{reason || '目前沒有額外異常原因。'}</p>
          </div>
          <div>
            <span>建議處理</span>
            <p>{recommendation || '保持目前設定，定期重新整理安全狀態。'}</p>
          </div>
          {action ? (
            <div className="security-card-action" onClick={(event) => event.stopPropagation()}>
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
