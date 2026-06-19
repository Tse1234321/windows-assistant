import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Dialog from '../components/Dialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toggle from '../components/Toggle.jsx';
import { useToast } from '../components/Toast.jsx';

const inputStyle = {
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
};

const CONDITION_TYPES = [
  { type: 'newFileInFolder', label: '資料夾出現新檔案' },
  { type: 'extension', label: '副檔名符合' },
  { type: 'sizeGreaterThan', label: '檔案大於 MB' },
  { type: 'schedule', label: '排程觸發' },
];

const ACTIONS = [
  { type: 'organizeFileByType', label: '整理檔案' },
  { type: 'organizeScreenshotByDate', label: '整理截圖' },
  { type: 'cleanupScanSafe', label: 'Clean Center 安全掃描' },
  { type: 'cleanupReminder', label: '提醒檢查 Clean Center' },
  { type: 'projectScanReminder', label: '提醒掃描 Project Hub' },
  { type: 'healthGuardCheck', label: '健康守護提醒' },
  { type: 'move', label: '移到指定資料夾' },
  { type: 'notify', label: '顯示通知' },
  { type: 'openFolder', label: '開啟來源資料夾' },
];

const DAYS = [
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
  { value: 0, label: '週日' },
];

function nowIso() {
  return new Date().toISOString();
}

function createRule({ name = '新的自動化', condition, action } = {}) {
  const now = nowIso();
  return {
    id: `a_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    enabled: true,
    condition: condition || { type: 'newFileInFolder', value: '', folder: '' },
    action: action || { type: 'notify', target: '' },
    createdAt: now,
    updatedAt: now,
  };
}

export default function Automations() {
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [automationResult, settingsResult] = await Promise.all([
      window.api.listAutomations(),
      window.api.getSettings(),
    ]);
    setRules(automationResult.automations || []);
    if (settingsResult.ok) setSettings(settingsResult.settings);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const paths = useMemo(() => ({
    downloads: settings?.general?.downloadsPath || '',
    screenshots: settings?.general?.screenshotsPath || settings?.screenshots?.path || '',
  }), [settings]);

  const persist = async (next) => {
    setRules(next);
    const result = await window.api.saveAutomations(next);
    toast(result.ok ? '自動化規則已儲存並重新載入背景服務' : result.error || '儲存失敗', result.ok ? 'ok' : 'error');
  };

  const update = (id, patch) => persist(rules.map((rule) => (
    rule.id === id ? { ...rule, ...patch, updatedAt: nowIso() } : rule
  )));

  const updateCondition = (id, patch) => {
    const rule = rules.find((item) => item.id === id);
    update(id, { condition: { ...rule.condition, ...patch } });
  };

  const updateAction = (id, patch) => {
    const rule = rules.find((item) => item.id === id);
    update(id, { action: { ...rule.action, ...patch } });
  };

  const addRule = () => persist([...rules, createRule()]);

  const addScheduleRule = () => persist([...rules, createRule({
    name: '每日 Clean Center 安全掃描',
    condition: { type: 'schedule', scheduleMode: 'daily', time: '21:00', everyMinutes: 60, dayOfWeek: 1 },
    action: { type: 'cleanupScanSafe', target: '' },
  })]);

  const addDownloadsRule = () => persist([...rules, createRule({
    name: 'Downloads 新檔自動整理',
    condition: { type: 'newFileInFolder', value: '', folder: paths.downloads },
    action: { type: 'organizeFileByType', target: '' },
  })]);

  const addScreenshotsRule = () => persist([...rules, createRule({
    name: '截圖新檔自動整理',
    condition: { type: 'newFileInFolder', value: '', folder: paths.screenshots },
    action: { type: 'organizeScreenshotByDate', target: '' },
  })]);

  const removeRule = async (id) => {
    await persist(rules.filter((rule) => rule.id !== id));
    setConfirmId(null);
  };

  const pickFolder = async (id, target) => {
    const result = await window.api.pickPath({ type: 'folder', title: '選擇資料夾' });
    if (!result.ok) return;
    if (target === 'condition') updateCondition(id, { folder: result.path });
    else updateAction(id, { target: result.path });
  };

  const enabledCount = rules.filter((rule) => rule.enabled !== false).length;

  return (
    <div className="automation-page">
      <PageHeader
        eyebrow="AUTOMATION"
        title="自動化"
        description="用 When / Then 規則處理重複工作，支援新檔案觸發與排程觸發。"
        actions={(
          <>
            <StatusBadge tone="ok">{enabledCount} 個啟用</StatusBadge>
            <Button variant="primary" onClick={addRule}>新增規則</Button>
          </>
        )}
      />

      <SectionPanel
        title="快速建立"
        description="先用常見情境建立，再依你的習慣微調。"
        actions={(
          <>
            <Button onClick={addDownloadsRule} disabled={!paths.downloads}>Downloads 自動整理</Button>
            <Button onClick={addScreenshotsRule} disabled={!paths.screenshots}>截圖自動整理</Button>
            <Button onClick={addScheduleRule}>每日安全掃描</Button>
          </>
        )}
      >
        <InlineAlert tone="info" title="排程提醒">
          排程每分鐘檢查一次是否到期；Clean Center 排程只做安全掃描與通知，不會自動刪檔。
        </InlineAlert>
      </SectionPanel>

      {loading ? (
        <div className="loading-block"><span className="spinner" />載入自動化規則...</div>
      ) : rules.length === 0 ? (
        <Card>
          <EmptyState title="尚無自動化" description="建立第一個規則，讓 App 開始主動處理重複工作。" action={<Button variant="primary" onClick={addRule}>建立規則</Button>} />
        </Card>
      ) : (
        <div className="automation-list">
          {rules.map((rule) => (
            <Card key={rule.id} style={{ marginBottom: 12 }}>
              <div className="automation-head">
                <div className="inline-controls">
                  <Toggle checked={rule.enabled !== false} onChange={(enabled) => update(rule.id, { enabled })} />
                  <input style={{ ...inputStyle, fontWeight: 700, minWidth: 240 }} value={rule.name} onChange={(event) => update(rule.id, { name: event.target.value })} />
                </div>
                <Button variant="danger" size="sm" onClick={() => setConfirmId(rule.id)}>刪除</Button>
              </div>

              <div className="rule-builder">
                <div>
                  <div className="panel-label">When</div>
                  <div className="inline-controls">
                    <select style={inputStyle} value={rule.condition.type} onChange={(event) => updateCondition(rule.id, { type: event.target.value })}>
                      {CONDITION_TYPES.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                    </select>
                    {rule.condition.type === 'newFileInFolder' ? (
                      <>
                        <input style={{ ...inputStyle, minWidth: 280 }} placeholder="監控資料夾" value={rule.condition.folder || ''} onChange={(event) => updateCondition(rule.id, { folder: event.target.value })} />
                        <Button size="sm" onClick={() => pickFolder(rule.id, 'condition')}>選擇</Button>
                      </>
                    ) : null}
                    {rule.condition.type === 'extension' || rule.condition.type === 'sizeGreaterThan' ? (
                      <input style={{ ...inputStyle, width: 150 }} placeholder={rule.condition.type === 'extension' ? '.pdf' : '100'} value={rule.condition.value || ''} onChange={(event) => updateCondition(rule.id, { value: event.target.value })} />
                    ) : null}
                    {rule.condition.type === 'schedule' ? (
                      <>
                        <select style={inputStyle} value={rule.condition.scheduleMode || 'interval'} onChange={(event) => updateCondition(rule.id, { scheduleMode: event.target.value })}>
                          <option value="interval">每隔幾分鐘</option>
                          <option value="daily">每天固定時間</option>
                          <option value="weekly">每週固定時間</option>
                        </select>
                        {(rule.condition.scheduleMode || 'interval') === 'interval' ? (
                          <input style={{ ...inputStyle, width: 110 }} type="number" min="1" value={rule.condition.everyMinutes || 60} onChange={(event) => updateCondition(rule.id, { everyMinutes: event.target.value })} />
                        ) : (
                          <input style={{ ...inputStyle, width: 120 }} type="time" value={rule.condition.time || '09:00'} onChange={(event) => updateCondition(rule.id, { time: event.target.value })} />
                        )}
                        {rule.condition.scheduleMode === 'weekly' ? (
                          <select style={inputStyle} value={rule.condition.dayOfWeek ?? 1} onChange={(event) => updateCondition(rule.id, { dayOfWeek: Number(event.target.value) })}>
                            {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                          </select>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="panel-label">Then</div>
                  <div className="inline-controls">
                    <select style={inputStyle} value={rule.action.type} onChange={(event) => updateAction(rule.id, { type: event.target.value, target: '' })}>
                      {ACTIONS.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                    </select>
                    {rule.action.type === 'move' ? (
                      <>
                        <input style={{ ...inputStyle, minWidth: 280 }} placeholder="目標資料夾" value={rule.action.target || ''} onChange={(event) => updateAction(rule.id, { target: event.target.value })} />
                        <Button size="sm" onClick={() => pickFolder(rule.id, 'action')}>選擇</Button>
                      </>
                    ) : null}
                  </div>
                  <p className="project-note">清理類動作採保守模式：只掃描、通知，不會自動刪除檔案。</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!confirmId}
        title="刪除自動化規則"
        message="此操作只會刪除規則，不會影響已整理的檔案。"
        confirmLabel="刪除"
        danger
        onConfirm={() => removeRule(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
