'use strict';

const { execFile } = require('child_process');

function execPowerShell(script, timeout = 45000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: stderr || err.message, stdout: stdout || '' });
        return resolve({ ok: true, stdout: stdout || '' });
      },
    );
  });
}

function parseJson(stdout, fallback) {
  try {
    return JSON.parse(stdout);
  } catch (_) {
    return fallback;
  }
}

async function getStatus() {
  const script = `
    $ErrorActionPreference = "SilentlyContinue"
    $mp = Get-MpComputerStatus
    $fw = Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction
    $tpm = Get-Tpm
    $secureBoot = $null
    try { $secureBoot = Confirm-SecureBootUEFI } catch {}
    $bitlocker = Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage
    $memoryIntegrity = $null
    try {
      $memoryIntegrity = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" -Name Enabled).Enabled
    } catch {}
    [PSCustomObject]@{
      Defender = $mp
      Firewall = $fw
      Tpm = $tpm
      SecureBoot = $secureBoot
      BitLocker = $bitlocker
      MemoryIntegrity = $memoryIntegrity
      CollectedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 6
  `;
  const result = await execPowerShell(script);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, status: parseJson(result.stdout, {}), collectedAt: new Date().toISOString() };
}

async function updateSignatures() {
  const result = await execPowerShell(
    'Update-MpSignature | Out-Null; Get-MpComputerStatus | Select-Object AntivirusSignatureLastUpdated,AntivirusSignatureVersion | ConvertTo-Json -Depth 3',
    120000,
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, status: parseJson(result.stdout, {}) };
}

module.exports = {
  getStatus,
  updateSignatures,
};
