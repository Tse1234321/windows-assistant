import React, { useEffect, useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';
import AlertList from '../components/AlertList.jsx';

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [types, setTypes] = useState({});
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!window.api) {
      setToast({ type: 'error', msg: '無法連接 Electron 主程序。' });
      setLoading(false);
      return;
    }
    const res = await window.api.getRules();
    setRules(res.rules || []);
    setTypes(res.types || {});
    // Pull current evaluation from the live system status.
    const status = await window.api.getSystemStatus();
    if (status.ok && status.rules) setLiveAlerts(status.rules.alerts || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (id, patch) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    const res = await window.api.saveRules(rules);
    if (res.ok) {
      setToast({ type: 'ok', msg: '規則已儲存，提醒已重新評估。' });
      const status = await window.api.getSystemStatus();
      if (status.ok && status.rules) setLiveAlerts(status.rules.alerts || []);
    } else {
      setToast({ type: 'error', msg: res.error || '儲存失敗' });
    }
  };

  return (
    <div>
      <h1 className="page-title">Smart Rules</h1>
      <p className="page-subtitle">
        設定條件，達到門檻時在 Dashboard 顯示提醒。<strong>第一版只提醒，不會自動執行危險操作。</strong>
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">規則設定</div>
        {loading ? (
          <p><span className="spinner" /> 載入中…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>啟用</th>
                <th>規則</th>
                <th>條件</th>
                <th>門檻</th>
                <th>等級</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.enabled !== false}
                      onChange={(e) => update(r.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td>{r.label || r.id}</td>
                  <td className="muted">
                    {types[r.type] ? types[r.type].label : r.type}
                  </td>
                  <td>
                    <input
                      type="number"
                      value={r.threshold}
                      onChange={(e) => update(r.id, { threshold: Number(e.target.value) })}
                      style={{
                        width: 80,
                        background: '#0b1220',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '4px 8px',
                      }}
                    />{' '}
                    <span className="muted">{types[r.type] ? types[r.type].unit : ''}</span>
                  </td>
                  <td>
                    <select
                      value={r.level || 'warn'}
                      onChange={(e) => update(r.id, { level: e.target.value })}
                      style={{
                        background: '#0b1220',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '4px 8px',
                      }}
                    >
                      <option value="warn">warn</option>
                      <option value="danger">danger</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="button-row" style={{ marginTop: 14, marginBottom: 0 }}>
          <ActionButton variant="primary" icon="💾" onClick={save}>
            儲存規則
          </ActionButton>
          <ActionButton variant="ghost" icon="↩️" onClick={load}>
            重新載入
          </ActionButton>
        </div>
        {toast ? <div className={`toast ${toast.type}`}>{toast.msg}</div> : null}
      </div>

      <div className="section-title">目前觸發的提醒</div>
      <AlertList alerts={liveAlerts} />
    </div>
  );
}
