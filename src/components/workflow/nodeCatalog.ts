/**
 * Catalog of workflow node types. This is front-end metadata only: the engine
 * remains the source of truth for execution behavior.
 */

export type NodeKind = 'trigger' | 'condition' | 'action';
export type FieldKind = 'text' | 'number' | 'folder' | 'time' | 'select' | 'days';

export interface FieldDef {
  key: string;
  label: string;
  labelEn: string;
  kind: FieldKind;
  placeholder?: string;
  unit?: string;
  options?: { value: string; label: string; labelEn: string }[];
}

export interface NodeTypeDef {
  type: string;
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
  icon: string;
  fields: FieldDef[];
  /** Action types that mutate files. The editor marks and confirms these. */
  destructive?: boolean;
}

export interface SummaryChip {
  label: string;
  value: string;
  empty?: boolean;
}

const folderField: FieldDef = {
  key: 'folder',
  label: '資料夾',
  labelEn: 'Folder',
  kind: 'folder',
  placeholder: 'C:\\Users\\you\\Downloads',
};

const extField: FieldDef = {
  key: 'value',
  label: '副檔名',
  labelEn: 'Extension',
  kind: 'text',
  placeholder: '.pdf',
};

const sizeField: FieldDef = {
  key: 'value',
  label: '大於',
  labelEn: 'Larger than',
  kind: 'number',
  placeholder: '100',
  unit: 'MB',
};

const timeField: FieldDef = {
  key: 'time',
  label: '時間',
  labelEn: 'Time',
  kind: 'time',
  placeholder: '09:00',
};

const scheduleModeField: FieldDef = {
  key: 'scheduleMode',
  label: '模式',
  labelEn: 'Mode',
  kind: 'select',
  options: [
    { value: 'interval', label: '間隔', labelEn: 'Interval' },
    { value: 'daily', label: '每日', labelEn: 'Daily' },
    { value: 'weekly', label: '每週', labelEn: 'Weekly' },
  ],
};

const everyMinutesField: FieldDef = {
  key: 'everyMinutes',
  label: '每隔',
  labelEn: 'Every',
  kind: 'number',
  placeholder: '30',
  unit: 'min',
};

const daysField: FieldDef = {
  key: 'days',
  label: '星期',
  labelEn: 'Days',
  kind: 'days',
};

const targetFolderField: FieldDef = {
  key: 'target',
  label: '目標資料夾',
  labelEn: 'Target folder',
  kind: 'folder',
};

export const TRIGGER_TYPES: NodeTypeDef[] = [
  {
    type: 'newFileInFolder',
    label: '資料夾出現新檔案',
    labelEn: 'New file in folder',
    desc: '當指定資料夾偵測到新檔案時啟動工作流。',
    descEn: 'Starts the workflow when a new file appears in a folder.',
    icon: 'folder-plus',
    fields: [folderField],
  },
  {
    type: 'extension',
    label: '符合副檔名',
    labelEn: 'Matches extension',
    desc: '用檔案副檔名作為觸發入口。',
    descEn: 'Uses a file extension as the trigger entry point.',
    icon: 'filter',
    fields: [extField],
  },
  {
    type: 'sizeGreaterThan',
    label: '檔案大於指定大小',
    labelEn: 'File larger than',
    desc: '當檔案大小超過門檻時觸發。',
    descEn: 'Triggers when a file is larger than the threshold.',
    icon: 'gauge',
    fields: [sizeField],
  },
  {
    type: 'schedule',
    label: '排程觸發',
    labelEn: 'On a schedule',
    desc: '在指定時間觸發工作流。',
    descEn: 'Runs the workflow at the configured time.',
    icon: 'clock',
    fields: [scheduleModeField, everyMinutesField, timeField, daysField],
  },
];

export const CONDITION_TYPES: NodeTypeDef[] = [
  {
    type: 'extension',
    label: '副檔名條件',
    labelEn: 'Extension condition',
    desc: '只允許符合副檔名的檔案通過。',
    descEn: 'Allows only files matching the extension.',
    icon: 'filter',
    fields: [extField],
  },
  {
    type: 'sizeGreaterThan',
    label: '大小條件',
    labelEn: 'Size condition',
    desc: '只允許大於指定 MB 的檔案通過。',
    descEn: 'Allows only files above the configured MB threshold.',
    icon: 'gauge',
    fields: [sizeField],
  },
];

export const ACTION_TYPES: NodeTypeDef[] = [
  {
    type: 'organizeFileByType',
    label: '整理檔案',
    labelEn: 'Organize file',
    desc: '依類型整理檔案到分類資料夾。',
    descEn: 'Organizes files into type-based folders.',
    icon: 'spark',
    fields: [],
    destructive: true,
  },
  {
    type: 'organizeScreenshotByDate',
    label: '整理截圖',
    labelEn: 'Organize screenshot',
    desc: '依日期分類整理截圖。',
    descEn: 'Organizes screenshots by date.',
    icon: 'image',
    fields: [],
    destructive: true,
  },
  {
    type: 'move',
    label: '移動到資料夾',
    labelEn: 'Move to folder',
    desc: '將檔案移動到指定目標資料夾。',
    descEn: 'Moves the file to the selected target folder.',
    icon: 'move',
    fields: [targetFolderField],
    destructive: true,
  },
  {
    type: 'notify',
    label: '顯示通知',
    labelEn: 'Show notification',
    desc: '送出系統通知，適合提醒或預警。',
    descEn: 'Shows a system notification for reminders or alerts.',
    icon: 'bell',
    fields: [],
  },
  {
    type: 'delay',
    label: '等待',
    labelEn: 'Delay',
    desc: '暫停流程一段時間再繼續下一個動作。',
    descEn: 'Pauses the workflow before continuing to the next action.',
    icon: 'clock',
    fields: [
      {
        key: 'value',
        label: '時間',
        labelEn: 'Duration',
        kind: 'number',
        placeholder: '5',
      },
      {
        key: 'unit',
        label: '單位',
        labelEn: 'Unit',
        kind: 'select',
        options: [
          { value: 'seconds', label: '秒', labelEn: 'Seconds' },
          { value: 'minutes', label: '分鐘', labelEn: 'Minutes' },
        ],
      },
    ],
  },
  {
    type: 'runProgram',
    label: '執行程式',
    labelEn: 'Run program',
    desc: '啟動本機程式或命令，可使用 {path}、{file}、{folder} token。',
    descEn: 'Runs a local command or program with {path}, {file}, and {folder} tokens.',
    icon: 'terminal',
    fields: [
      {
        key: 'command',
        label: '命令',
        labelEn: 'Command',
        kind: 'text',
        placeholder: 'notepad.exe',
      },
      {
        key: 'args',
        label: '參數',
        labelEn: 'Args',
        kind: 'text',
        placeholder: '{path}',
      },
      {
        key: 'cwd',
        label: '工作目錄',
        labelEn: 'Working dir',
        kind: 'folder',
      },
      {
        key: 'waitForExit',
        label: '等待結束',
        labelEn: 'Wait',
        kind: 'select',
        options: [
          { value: 'no', label: '否', labelEn: 'No' },
          { value: 'yes', label: '是', labelEn: 'Yes' },
        ],
      },
    ],
    destructive: true,
  },
  {
    type: 'openFolder',
    label: '開啟資料夾',
    labelEn: 'Open folder',
    desc: '打開相關資料夾方便檢查。',
    descEn: 'Opens the related folder for review.',
    icon: 'folder-open',
    fields: [],
  },
  {
    type: 'cleanupScanSafe',
    label: 'Clean Center 安全掃描',
    labelEn: 'Clean Center safe scan',
    desc: '啟動清理中心的安全掃描。',
    descEn: 'Starts a safe Clean Center scan.',
    icon: 'shield',
    fields: [],
  },
  {
    type: 'cleanupReminder',
    label: '提醒清理',
    labelEn: 'Clean Center reminder',
    desc: '提醒使用者回到 Clean Center 處理。',
    descEn: 'Reminds the user to review Clean Center.',
    icon: 'bell',
    fields: [],
  },
  {
    type: 'projectScanReminder',
    label: '提醒掃描專案',
    labelEn: 'Project Hub reminder',
    desc: '提醒使用者檢查 Project Hub 狀態。',
    descEn: 'Reminds the user to review Project Hub.',
    icon: 'nodes',
    fields: [],
  },
  {
    type: 'healthGuardCheck',
    label: '健康守護檢查',
    labelEn: 'Health Guard check',
    desc: '執行系統健康守護檢查。',
    descEn: 'Runs the Health Guard system check.',
    icon: 'pulse',
    fields: [],
  },
];

const BY_KIND: Record<NodeKind, NodeTypeDef[]> = {
  trigger: TRIGGER_TYPES,
  condition: CONDITION_TYPES,
  action: ACTION_TYPES,
};

export const KIND_LABELS: Record<NodeKind, { badge: string; label: string; labelEn: string }> = {
  trigger: { badge: 'TRIGGER', label: '觸發', labelEn: 'Trigger' },
  condition: { badge: 'IF', label: '條件', labelEn: 'Condition' },
  action: { badge: 'DO', label: '動作', labelEn: 'Action' },
};

export function catalogFor(kind: NodeKind): NodeTypeDef[] {
  return BY_KIND[kind] || [];
}

export function findDef(kind: NodeKind, type: string): NodeTypeDef | undefined {
  return catalogFor(kind).find((def) => def.type === type);
}

export function nodeLabel(kind: NodeKind, type: string, language: string): string {
  const def = findDef(kind, type);
  if (!def) return type;
  return language === 'zh' ? def.label : def.labelEn;
}

export function nodeDescription(kind: NodeKind, type: string, language: string): string {
  const def = findDef(kind, type);
  if (!def) return '';
  return language === 'zh' ? def.desc : def.descEn;
}

export function fieldLabel(field: FieldDef, language: string): string {
  return language === 'zh' ? field.label : field.labelEn;
}

export function kindLabel(kind: NodeKind, language: string): string {
  const info = KIND_LABELS[kind];
  return language === 'zh' ? info.label : info.labelEn;
}

function shortPath(value: unknown): string {
  const text = String(value || '');
  if (!text) return '';
  const parts = text.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || text;
}

function displayFieldValue(field: FieldDef, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.kind === 'days') {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return Array.isArray(value) ? value.map((day) => labels[Number(day)]).filter(Boolean).join(', ') : '';
  }
  if (field.kind === 'select') {
    const found = field.options?.find((option) => option.value === String(value));
    return found ? found.labelEn : String(value);
  }
  if (field.kind === 'folder') return shortPath(value) || String(value);
  if (field.kind === 'number') return `${value}${field.unit ? ` ${field.unit}` : ''}`;
  return String(value);
}

export function summaryChips(
  kind: NodeKind,
  type: string,
  config: Record<string, unknown>,
  language: string,
): SummaryChip[] {
  const def = findDef(kind, type);
  if (!def?.fields.length) {
    return [
      {
        label: language === 'zh' ? '設定' : 'Config',
        value: language === 'zh' ? '無需設定' : 'No setup needed',
      },
    ];
  }

  return def.fields.map((field) => {
    const value = displayFieldValue(field, config?.[field.key]);
    return {
      label: fieldLabel(field, language),
      value: value || (language === 'zh' ? '待設定' : 'Not set'),
      empty: !value,
    };
  });
}

/** A handful of ready-made workflows shown as starter templates / examples. */
export function starterTemplates(): { name: string; nameEn: string; build: () => unknown }[] {
  return [
    {
      name: '整理下載資料夾',
      nameEn: 'Tidy Downloads',
      build: () => ({
        nodes: [
          { kind: 'trigger', type: 'newFileInFolder', config: {}, position: { x: 80, y: 140 } },
          { kind: 'action', type: 'organizeFileByType', config: {}, position: { x: 420, y: 140 } },
        ],
      }),
    },
    {
      name: '大型檔案提醒',
      nameEn: 'Large-file reminder',
      build: () => ({
        nodes: [
          {
            kind: 'trigger',
            type: 'sizeGreaterThan',
            config: { value: 500 },
            position: { x: 80, y: 140 },
          },
          { kind: 'action', type: 'notify', config: {}, position: { x: 420, y: 140 } },
        ],
      }),
    },
  ];
}
