export const RISK_SAFE = '安全清理';
export const RISK_REVIEW = '建議確認';
export const RISK_AVOID = '不建議自動清理';
export const RISK_PERMANENT = '永久刪除';

export const categoryInfo = {
  'Windows Temp': {
    title: 'Windows Temp',
    what: 'Windows 與系統服務產生的暫存檔，通常位於 Windows Temp。',
    after: '清理後檔案會移到資源回收筒；系統或程式需要時會重新建立暫存檔。',
    risk: '如果 Windows 正在更新、安裝驅動或執行安裝程式，清理過新的暫存檔可能讓任務失敗。',
    recommendation: '建議只清理最後修改超過 7 天的項目；最近 24 小時內的檔案不會預設勾選。',
  },
  'User Temp': {
    title: 'User Temp',
    what: '目前使用者帳號下的 App 暫存檔，常見於 AppData Local Temp。',
    after: '多數 App 會自動重新建立需要的暫存檔，下次開啟可能稍慢。',
    risk: '若 App 正在下載、編譯、安裝或轉檔，刪除使用中的暫存檔可能造成該工作失敗。',
    recommendation: '建議只清理 7 天以上的項目，並避開 Downloads、Desktop、Documents。',
  },
  'Browser Cache': {
    title: 'Browser Cache',
    what: 'Chrome / Edge 等瀏覽器儲存的網站快取、Code Cache 與 GPU Cache。',
    after: '網站資源會重新下載，初次開啟可能稍慢；不會刪除書籤、密碼或瀏覽紀錄。',
    risk: '瀏覽器正在執行時部分檔案可能被鎖定，系統會跳過無法清理的項目。',
    recommendation: '通常可以清理，但如果正在進行重要網頁工作，建議先關閉瀏覽器。',
  },
  'Thumbnail Cache': {
    title: 'Thumbnail Cache',
    what: 'Windows 檔案總管產生的圖片、影片縮圖快取。',
    after: '資料夾縮圖會重新產生，第一次開啟圖片或影片資料夾時可能變慢。',
    risk: '不會刪除原始圖片或影片，但可能讓縮圖短時間消失。',
    recommendation: '縮圖顯示異常或佔用空間較大時再清理。',
  },
  'Log / Dump': {
    title: 'Log / Dump',
    what: '程式紀錄、錯誤 dump、暫存備份檔。',
    after: '清理後會少掉除錯與追查錯誤用的紀錄。',
    risk: '如果近期有程式閃退或正在排查問題，刪除紀錄可能讓問題更難追蹤。',
    recommendation: '建議確認後清理，最近的 log/dump 可先保留。',
  },
  'Large Files': {
    title: 'Large Files',
    what: '在掃描根目錄中找到的大型檔案，可能是影片、壓縮檔、安裝包或專案素材。',
    after: '刪除後可釋放大量空間，但這通常是使用者資料。',
    risk: '可能刪到重要素材、備份或專案產物，不建議自動清理。',
    recommendation: '只作為提醒清單，請人工確認內容後再處理。',
  },
  'Duplicate Files': {
    title: 'Duplicate Files',
    what: '大小與內容雜湊相同的檔案群組。',
    after: '移除重複副本可節省空間。',
    risk: '重複檔仍可能是專案、備份或不同資料夾流程需要的副本。',
    recommendation: '建議逐筆確認，不要一次全部清理。',
  },
  'Recycle Bin': {
    title: 'Recycle Bin',
    what: 'Windows 資源回收筒內已刪除但尚未永久移除的檔案。',
    after: '清空後通常無法再從原位置還原。',
    risk: '這是永久刪除行為，復原成本高。',
    recommendation: '確認回收筒內沒有要救回的檔案後再清空。',
  },
  Startup: {
    title: 'Startup',
    what: '登入 Windows 後自動啟動的捷徑或項目。',
    after: '停用後可加快開機或登入後的負載。',
    risk: '可能讓同步、驅動工具或常駐程式不再自動啟動。',
    recommendation: '只檢視與管理，不建議由清理中心自動刪除。',
  },
};

export const CATEGORY_ICONS = {
  'Windows Temp': '⊞',
  'User Temp': '≋',
  'Browser Cache': '◍',
  'Thumbnail Cache': '▦',
  'Log / Dump': '≡',
  'Large Files': '◆',
  'Duplicate Files': '⧉',
  'Recycle Bin': '♻',
  Startup: '⏻',
};

export const CATEGORY_LABELS = {
  'Windows Temp': '系統暫存',
  'User Temp': '使用者暫存',
  'Browser Cache': '瀏覽器快取',
  'Thumbnail Cache': '縮圖快取',
  'Log / Dump': '紀錄 / Dump',
  'Large Files': '大型檔案',
  'Duplicate Files': '重複檔案',
  'Recycle Bin': '資源回收筒',
  Startup: '啟動項',
};

export const IMPACT_TONE = {
  高: 'danger',
  中: 'warn',
  低: 'ok',
};

// Categories whose items participate in the selectable clean flow
// (Recycle Bin and Startup have their own dedicated actions).
export const CLEANABLE_CATEGORIES = [
  'Windows Temp',
  'User Temp',
  'Browser Cache',
  'Thumbnail Cache',
  'Log / Dump',
  'Large Files',
  'Duplicate Files',
];

export function categoryLabel(name) {
  return CATEGORY_LABELS[name] || name;
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

export function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

export function categoryRows(categories) {
  if (!categories) return [];
  if (Array.isArray(categories)) return categories;
  return Object.entries(categories).map(([name, row]) => ({ name, ...(row || {}) }));
}

export function normalizeRisk(risk) {
  if (risk === 'Safe') return RISK_SAFE;
  if (risk === 'Review') return RISK_REVIEW;
  if (risk === 'High risk') return RISK_AVOID;
  return risk || RISK_REVIEW;
}

export function riskTone(risk) {
  const normalized = normalizeRisk(risk);
  if (normalized === RISK_PERMANENT || normalized === RISK_AVOID) return 'danger';
  if (normalized === RISK_REVIEW) return 'warn';
  return 'ok';
}

export function parentFolder(filePath) {
  const raw = String(filePath || '');
  const index = Math.max(raw.lastIndexOf('\\'), raw.lastIndexOf('/'));
  return index > 0 ? raw.slice(0, index) : raw;
}
