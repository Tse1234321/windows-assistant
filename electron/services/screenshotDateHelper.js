'use strict';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function formatDateParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatLocalDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function dateFromFileName(fileName) {
  const value = String(fileName || '');
  const separated = value.match(/(?:^|[^\d])(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:[^\d]|$)/);
  if (separated && isValidDateParts(separated[1], separated[2], separated[3])) {
    return formatDateParts(separated[1], separated[2], separated[3]);
  }

  const compact = value.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (compact && isValidDateParts(compact[1], compact[2], compact[3])) {
    return formatDateParts(compact[1], compact[2], compact[3]);
  }

  return null;
}

function getScreenshotDate(fileName, fileStat) {
  const fromName = dateFromFileName(fileName);
  if (fromName) return fromName;

  if (fileStat && fileStat.birthtime instanceof Date && fileStat.birthtimeMs > 0) {
    const fromBirth = formatLocalDate(fileStat.birthtime);
    if (fromBirth) return fromBirth;
  }

  if (fileStat && fileStat.mtime instanceof Date) {
    const fromMtime = formatLocalDate(fileStat.mtime);
    if (fromMtime) return fromMtime;
  }

  return formatLocalDate(new Date());
}

module.exports = {
  dateFromFileName,
  formatLocalDate,
  getScreenshotDate,
};
