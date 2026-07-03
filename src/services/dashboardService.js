let dashboardCache = null;

export function getCachedDashboardStats() {
  return dashboardCache?.data || null;
}

export function isDashboardCacheFresh(maxAgeMs = 60000) {
  if (!dashboardCache?.data) return false;
  return Date.now() - dashboardCache.fetchedAt < Math.max(0, Number(maxAgeMs) || 0);
}

export async function getDashboardStats(options = {}) {
  const maxAgeMs = Math.max(0, Number(options.maxAgeMs ?? 60000) || 0);
  if (!options.force && isDashboardCacheFresh(maxAgeMs)) {
    return { ...dashboardCache.data, fromCache: true };
  }
  if (!window.api?.getDashboardStats) {
    return {
      ok: false,
      error: 'Dashboard IPC is unavailable. Start the Electron app to load live system data.',
    };
  }
  const result = await window.api.getDashboardStats();
  if (result?.ok) {
    dashboardCache = { data: result, fetchedAt: Date.now() };
  }
  return result;
}
