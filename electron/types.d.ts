/**
 * Shared domain types for PC Life Assistant.
 *
 * The runtime is plain JavaScript (services are CommonJS), so these types are
 * authored once here and consumed by the strict TypeScript surface (new code in
 * src/**, e.g. the workflow engine). They intentionally model the *shapes* the
 * services pass around rather than re-declaring every field — keep them in sync
 * as the settings schema in electron/services/settingsService.js evolves.
 */

export interface GeneralSettings {
  downloadsPath: string;
  monitorDrives: string[];
  monitorDrive: string;
  screenshotsPath: string;
  vscodePath: string;
  autoLaunch: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;
  showOnStartup: boolean;
  showOnResume: boolean;
  notifications: boolean;
  autoUpdate: boolean;
  theme: 'system' | 'light' | 'dark';
  language: 'zh' | 'en';
  accentColor: string;
  compactMode: boolean;
  watchEnabled: boolean;
  watchFolders: string[];
  projectScanRoots: string[];
  automationsEnabled: boolean;
  askBeforeOrganizing: boolean;
  keepHistory: boolean;
  firstRunCompleted: boolean;
  lastSetupCheckAt: string;
}

export interface HealthGuardSettings {
  enabled: boolean;
  mode: string;
  intervalMinutes: number;
  cooldownMinutes: number;
  cpuTempC: number;
  gpuTempC: number;
  ramPercent: number;
  diskFreeGb: number;
  diskFreePercent: number;
}

/** A single automation rule (legacy flat shape: one condition -> one action). */
export interface AutomationRule {
  id?: string;
  enabled?: boolean;
  condition?: AutomationCondition;
  action?: AutomationAction;
  [key: string]: unknown;
}

export interface AutomationCondition {
  type: 'extension' | 'sizeGreaterThan' | 'newFileInFolder' | 'schedule' | string;
  value?: string | number;
  [key: string]: unknown;
}

export interface AutomationAction {
  type: string;
  [key: string]: unknown;
}

/** Metadata for a single file event the automation/workflow engine reacts to. */
export interface FileEventInfo {
  file: string;
  path: string;
  folder: string;
  ext?: string;
  size?: number;
}

export interface AppSettings {
  general: GeneralSettings;
  healthGuard: HealthGuardSettings;
  cleanup: { enabledCategories: string[]; lastScanAt: string };
  modes: unknown[];
  projects: unknown[];
  rules: unknown[];
  automations: AutomationRule[];
  workflows?: Workflow[];
  history: unknown[];
  [key: string]: unknown;
}

// ---- Workflow engine (P1) -------------------------------------------------

export type WorkflowNodeKind = 'trigger' | 'condition' | 'action';

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  /** The trigger/condition/action type, e.g. 'newFileInFolder' or 'notify'. */
  type: string;
  /** Type-specific configuration (folder path, extension, threshold, …). */
  config?: Record<string, unknown>;
  /** Canvas position, persisted so the graph reopens where the user left it. */
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
