'use strict';

const { execFile } = require('child_process');

const POWER_SHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];
const BRIGHTNESS_TIMEOUT_MS = 10000;

function clampBrightnessLevel(value) {
  if (value === null || value === undefined || value === '') return null;
  const level = Number(value);
  if (!Number.isFinite(level)) return null;
  return Math.max(0, Math.min(100, Math.round(level)));
}

function parsePowerShellJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch (_) {
      /* keep scanning for the JSON line */
    }
  }
  return null;
}

function runPowerShell(script, timeout = BRIGHTNESS_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      [...POWER_SHELL_ARGS, '-EncodedCommand', encoded],
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            ok: false,
            error: (stderr || err.message || 'PowerShell failed').trim(),
            stdout: stdout || '',
          });
          return;
        }
        resolve({ ok: true, stdout: stdout || '' });
      },
    );
  });
}

const DDC_HELPERS = String.raw`
function Write-BrightnessJson($value) {
  $value | ConvertTo-Json -Compress -Depth 5
}

function Add-DdcType {
  if ('MonitorDdc' -as [type]) { return }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class MonitorDdc {
  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, IntPtr lprcMonitor, IntPtr dwData);

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string szPhysicalMonitorDescription;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint count);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint count, [Out] PHYSICAL_MONITOR[] monitors);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool DestroyPhysicalMonitors(uint count, PHYSICAL_MONITOR[] monitors);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint min, out uint current, out uint max);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool SetMonitorBrightness(IntPtr hMonitor, uint value);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr hMonitor, byte code, out uint type, out uint current, out uint maximum);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool SetVCPFeature(IntPtr hMonitor, byte code, uint value);
}
"@
}

function Get-DxvaBrightness {
  Add-DdcType
  $script:BrightnessReadings = @()
  $callback = [MonitorDdc+MonitorEnumProc]{
    param([IntPtr]$hMonitor, [IntPtr]$hdcMonitor, [IntPtr]$lprcMonitor, [IntPtr]$dwData)
    [uint32]$count = 0
    if ([MonitorDdc]::GetNumberOfPhysicalMonitorsFromHMONITOR($hMonitor, [ref]$count) -and $count -gt 0) {
      $monitors = New-Object 'MonitorDdc+PHYSICAL_MONITOR[]' ([int]$count)
      if ([MonitorDdc]::GetPhysicalMonitorsFromHMONITOR($hMonitor, $count, $monitors)) {
        try {
          foreach ($monitor in $monitors) {
            [uint32]$minimum = 0
            [uint32]$current = 0
            [uint32]$maximum = 0
            if ([MonitorDdc]::GetMonitorBrightness($monitor.hPhysicalMonitor, [ref]$minimum, [ref]$current, [ref]$maximum) -and $maximum -gt $minimum) {
              $script:BrightnessReadings += [PSCustomObject]@{
                level = [int][Math]::Round((($current - $minimum) / ($maximum - $minimum)) * 100)
                display = $monitor.szPhysicalMonitorDescription
                method = "dxva2"
              }
              continue
            }

            [uint32]$type = 0
            [uint32]$vcpCurrent = 0
            [uint32]$vcpMaximum = 0
            if ([MonitorDdc]::GetVCPFeatureAndVCPFeatureReply($monitor.hPhysicalMonitor, 0x10, [ref]$type, [ref]$vcpCurrent, [ref]$vcpMaximum) -and $vcpMaximum -gt 0) {
              $script:BrightnessReadings += [PSCustomObject]@{
                level = [int][Math]::Round(($vcpCurrent / $vcpMaximum) * 100)
                display = $monitor.szPhysicalMonitorDescription
                method = "ddcci"
              }
            }
          }
        } finally {
          [MonitorDdc]::DestroyPhysicalMonitors($count, $monitors) | Out-Null
        }
      }
    }
    return $true
  }
  [MonitorDdc]::EnumDisplayMonitors([IntPtr]::Zero, [IntPtr]::Zero, $callback, [IntPtr]::Zero) | Out-Null
  return ,$script:BrightnessReadings
}

function Set-DxvaBrightness([int]$Target) {
  Add-DdcType
  $script:BrightnessSetResults = @()
  $callback = [MonitorDdc+MonitorEnumProc]{
    param([IntPtr]$hMonitor, [IntPtr]$hdcMonitor, [IntPtr]$lprcMonitor, [IntPtr]$dwData)
    [uint32]$count = 0
    if ([MonitorDdc]::GetNumberOfPhysicalMonitorsFromHMONITOR($hMonitor, [ref]$count) -and $count -gt 0) {
      $monitors = New-Object 'MonitorDdc+PHYSICAL_MONITOR[]' ([int]$count)
      if ([MonitorDdc]::GetPhysicalMonitorsFromHMONITOR($hMonitor, $count, $monitors)) {
        try {
          foreach ($monitor in $monitors) {
            [uint32]$minimum = 0
            [uint32]$current = 0
            [uint32]$maximum = 0
            if ([MonitorDdc]::GetMonitorBrightness($monitor.hPhysicalMonitor, [ref]$minimum, [ref]$current, [ref]$maximum) -and $maximum -gt $minimum) {
              $highValue = [uint32][Math]::Round($minimum + (($maximum - $minimum) * $Target / 100))
              if ([MonitorDdc]::SetMonitorBrightness($monitor.hPhysicalMonitor, $highValue)) {
                $script:BrightnessSetResults += "dxva2"
                continue
              }
            }

            [uint32]$type = 0
            [uint32]$vcpCurrent = 0
            [uint32]$vcpMaximum = 100
            $vcpValue = [uint32]$Target
            if ([MonitorDdc]::GetVCPFeatureAndVCPFeatureReply($monitor.hPhysicalMonitor, 0x10, [ref]$type, [ref]$vcpCurrent, [ref]$vcpMaximum) -and $vcpMaximum -gt 0) {
              $vcpValue = [uint32][Math]::Round(($vcpMaximum * $Target) / 100)
            }
            if ([MonitorDdc]::SetVCPFeature($monitor.hPhysicalMonitor, 0x10, $vcpValue)) {
              $script:BrightnessSetResults += "ddcci"
            }
          }
        } finally {
          [MonitorDdc]::DestroyPhysicalMonitors($count, $monitors) | Out-Null
        }
      }
    }
    return $true
  }
  [MonitorDdc]::EnumDisplayMonitors([IntPtr]::Zero, [IntPtr]::Zero, $callback, [IntPtr]::Zero) | Out-Null
  return ,$script:BrightnessSetResults
}

function Get-WmiBrightness {
  try {
    $monitor = @(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1)[0]
    if ($null -ne $monitor -and $null -ne $monitor.CurrentBrightness) {
      return [int]$monitor.CurrentBrightness
    }
  } catch {}
  return $null
}

function Set-WmiBrightness([int]$Target) {
  try {
    $methods = @(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop)
    $changed = 0
    foreach ($method in $methods) {
      Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $Target } -ErrorAction Stop | Out-Null
      $changed += 1
    }
    return $changed
  } catch {
    return 0
  }
}
`;

const GET_BRIGHTNESS_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
` + DDC_HELPERS + String.raw`
try {
  $dxvaReadings = @(Get-DxvaBrightness)
  if ($dxvaReadings.Count -gt 0) {
    Write-BrightnessJson @{
      ok = $true
      supported = $true
      level = [int]$dxvaReadings[0].level
      method = $dxvaReadings[0].method
      displays = $dxvaReadings.Count
    }
    exit 0
  }
} catch {}

$wmiLevel = Get-WmiBrightness
if ($null -ne $wmiLevel) {
  Write-BrightnessJson @{
    ok = $true
    supported = $true
    level = [int]$wmiLevel
    method = "wmi"
    displays = 1
  }
  exit 0
}

Write-BrightnessJson @{
  ok = $true
  supported = $false
  level = $null
  method = "none"
  displays = 0
  error = "No brightness controller was found."
}
`;

function buildSetBrightnessScript(level) {
  return String.raw`
$ErrorActionPreference = "Stop"
$Target = ` + String(level) + String.raw`
` + DDC_HELPERS + String.raw`
$dxvaMethods = @()
$wmiChanged = 0

try {
  $dxvaMethods = @(Set-DxvaBrightness $Target)
} catch {}

$wmiChanged = Set-WmiBrightness $Target

$methods = @($dxvaMethods | Select-Object -Unique)
if ($wmiChanged -gt 0) {
  $methods += "wmi"
}

if (($dxvaMethods.Count + $wmiChanged) -gt 0) {
  $method = ($methods | Select-Object -Unique) -join "+"

  Write-BrightnessJson @{
    ok = $true
    supported = $true
    level = $Target
    method = $method
    displays = ($dxvaMethods.Count + $wmiChanged)
  }
  exit 0
}

Write-BrightnessJson @{
  ok = $false
  supported = $false
  level = $Target
  method = "none"
  displays = 0
  error = "No brightness controller was found."
}
`;
}

function normalizeBrightnessResult(payload, fallbackLevel = null) {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      supported: false,
      level: fallbackLevel,
      method: 'none',
      error: 'Brightness command did not return a valid response.',
    };
  }

  const level = clampBrightnessLevel(payload.level);
  return {
    ok: payload.ok === true,
    supported: payload.supported === true,
    level,
    method: typeof payload.method === 'string' ? payload.method : 'none',
    displays: Number.isFinite(Number(payload.displays)) ? Number(payload.displays) : 0,
    error: typeof payload.error === 'string' ? payload.error : '',
  };
}

async function getBrightness() {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      supported: false,
      level: null,
      method: 'none',
      error: 'Brightness control is only available on Windows.',
    };
  }

  const result = await runPowerShell(GET_BRIGHTNESS_SCRIPT);
  if (!result.ok) {
    return {
      ok: false,
      supported: false,
      level: null,
      method: 'none',
      error: result.error || 'Could not read display brightness.',
    };
  }

  return normalizeBrightnessResult(parsePowerShellJson(result.stdout));
}

async function setBrightness(value) {
  const level = clampBrightnessLevel(value);
  if (level === null) {
    return {
      ok: false,
      supported: false,
      level: null,
      method: 'none',
      error: 'Brightness level must be a number from 0 to 100.',
    };
  }

  if (process.platform !== 'win32') {
    return {
      ok: false,
      supported: false,
      level,
      method: 'none',
      error: 'Brightness control is only available on Windows.',
    };
  }

  const result = await runPowerShell(buildSetBrightnessScript(level));
  if (!result.ok) {
    return {
      ok: false,
      supported: false,
      level,
      method: 'none',
      error: result.error || 'Could not set display brightness.',
    };
  }

  return normalizeBrightnessResult(parsePowerShellJson(result.stdout), level);
}

module.exports = {
  getBrightness,
  setBrightness,
  __test: {
    buildSetBrightnessScript,
    clampBrightnessLevel,
    normalizeBrightnessResult,
    parsePowerShellJson,
  },
};
