/**
 * Ambient declaration for the secure preload bridge (`window.api`).
 */

interface WorkflowsApi {
  list?: () => Promise<unknown>;
  save?: (workflow: unknown) => Promise<unknown>;
  run?: (id: string) => Promise<unknown>;
  dryRun?: (id: string) => Promise<unknown>;
  setEnabled?: (id: string, enabled: boolean) => Promise<unknown>;
}

interface SecurityApi {
  getStatus?: () => Promise<any>;
  updateSignatures?: () => Promise<any>;
}

interface AntivirusApi {
  startScan?: (payload: { type: string; path?: string }) => Promise<any>;
  cancelScan?: () => Promise<any>;
  listThreats?: () => Promise<any>;
  removeThreat?: (payload?: any) => Promise<any>;
  restoreThreat?: (payload?: any) => Promise<any>;
  allowThreat?: (payload?: any) => Promise<any>;
  checkReputation?: (pathOrHash: string) => Promise<any>;
  uploadToVirusTotal?: (filePath: string) => Promise<any>;
  getSettings?: () => Promise<any>;
  saveSettings?: (settings: any) => Promise<any>;
  onScanProgress?: (callback: (progress: any) => void) => () => void;
  onScanResult?: (callback: (result: any) => void) => () => void;
}

interface AdminLaunchApi {
  getStatus?: () => Promise<any>;
  enable?: () => Promise<any>;
  disable?: () => Promise<any>;
  launchElevated?: () => Promise<any>;
}

interface SetupToolsApi {
  getStatus?: () => Promise<any>;
  installCoreTemp?: () => Promise<any>;
  openCoreTempDownload?: () => Promise<any>;
  openVirusTotalJoin?: () => Promise<any>;
  openVirusTotalApiKey?: () => Promise<any>;
}

interface AppApi {
  workflows?: WorkflowsApi;
  security?: SecurityApi;
  antivirus?: AntivirusApi;
  adminLaunch?: AdminLaunchApi;
  setupTools?: SetupToolsApi;
  getBrightness?: () => Promise<any>;
  setBrightness?: (level: number) => Promise<any>;
  getDiagnostics?: () => Promise<any>;
  runRepair?: (action: string) => Promise<any>;
  exportDiagnostics?: () => Promise<any>;
  openExternal?: (url: string) => Promise<any>;
  pickPath?: (opts: { type: 'file' | 'folder'; title?: string }) => Promise<{ ok?: boolean; path?: string; canceled?: boolean; error?: string }>;
  [key: string]: unknown;
}

interface Window {
  api?: AppApi;
}
