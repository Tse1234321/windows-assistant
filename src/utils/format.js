// Small formatting helpers shared across the UI.

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatGB(bytes) {
  if (!bytes || bytes <= 0) return '0 GB';
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

export function formatUptime(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小時`);
  parts.push(`${minutes} 分`);
  return parts.join(' ');
}

// Returns a colour token based on a usage percentage (0-100).
export function usageLevel(percent) {
  if (percent >= 85) return 'danger';
  if (percent >= 70) return 'warn';
  return 'ok';
}
