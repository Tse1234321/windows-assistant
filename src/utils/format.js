export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const unit = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(decimals))} ${sizes[index]}`;
}

export function formatGB(bytes) {
  if (!bytes || bytes <= 0) return '0 GB';
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

export function formatUptime(seconds) {
  if (!seconds || seconds <= 0) return '--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小時`);
  parts.push(`${minutes} 分鐘`);
  return parts.join(' ');
}

export function usageLevel(percent) {
  if (percent >= 85) return 'danger';
  if (percent >= 70) return 'warn';
  return 'ok';
}
