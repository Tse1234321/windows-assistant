param(
  [Parameter(Mandatory=$true)][string]$OutPath,
  [string]$TitleLike = "PC Life Assistant"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT pvAttribute, int cbAttribute);
}
"@
$HWND_TOPMOST = New-Object IntPtr(-1)
$HWND_NOTOPMOST = New-Object IntPtr(-2)
$SWP_NOMOVE = 0x0002; $SWP_NOSIZE = 0x0001; $SWP_SHOWWINDOW = 0x0040

# Find the window by main window title
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*$TitleLike*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error "window not found: $TitleLike"; exit 1 }
$h = $proc.MainWindowHandle

# Minimize the controlling Claude window so it doesn't overlap the capture
$claude = Get-Process -Name claude -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($claude) { [WinCap]::ShowWindow($claude.MainWindowHandle, 6) | Out-Null } # SW_MINIMIZE

if ([WinCap]::IsIconic($h)) { [WinCap]::ShowWindow($h, 9) | Out-Null } # SW_RESTORE
[WinCap]::SetForegroundWindow($h) | Out-Null
[WinCap]::SetWindowPos($h, $HWND_TOPMOST, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW) | Out-Null
Start-Sleep -Milliseconds 700

$r = New-Object WinCap+RECT
$ok = [WinCap]::DwmGetWindowAttribute($h, 9, [ref]$r, [System.Runtime.InteropServices.Marshal]::SizeOf($r))
if ($ok -ne 0) { [WinCap]::GetWindowRect($h, [ref]$r) | Out-Null }

$w = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { Write-Error "bad bounds"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size $w, $ht))
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
# Release topmost so the window behaves normally again
[WinCap]::SetWindowPos($h, $HWND_NOTOPMOST, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW) | Out-Null
# Restore the Claude window
if ($claude) { [WinCap]::ShowWindow($claude.MainWindowHandle, 9) | Out-Null } # SW_RESTORE
Write-Output ("saved {0} ({1}x{2})" -f $OutPath, $w, $ht)
