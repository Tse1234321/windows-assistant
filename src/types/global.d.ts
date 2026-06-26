/**
 * Ambient declaration for the secure preload bridge (`window.api`).
 *
 * The bridge is defined in electron/preload.js via contextBridge and exposes a
 * large, evolving surface. Rather than mirror every method here (which would
 * drift), we type the slices that strict TypeScript code consumes and allow the
 * rest through an index signature. Tighten specific namespaces as call sites
 * move to TypeScript.
 */

interface SecurityApi {
  getStatus?: () => Promise<unknown>;
  quickScan?: () => Promise<unknown>;
  updateSignatures?: () => Promise<unknown>;
  openWindowsSecurity?: () => Promise<unknown>;
  openFirewallSettings?: () => Promise<unknown>;
}

interface WorkflowsApi {
  list?: () => Promise<unknown>;
  save?: (workflow: unknown) => Promise<unknown>;
  run?: (id: string) => Promise<unknown>;
  dryRun?: (id: string) => Promise<unknown>;
  setEnabled?: (id: string, enabled: boolean) => Promise<unknown>;
}

interface AppApi {
  security?: SecurityApi;
  workflows?: WorkflowsApi;
  // Other namespaces (cleanup, modes, files, …) are still untyped.
  [key: string]: unknown;
}

interface Window {
  api?: AppApi;
}
