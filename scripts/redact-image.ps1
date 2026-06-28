param(
  [Parameter(Mandatory=$true)][string]$InPath,
  [Parameter(Mandatory=$true)][string]$OutPath,
  [Parameter(Mandatory=$true)][int]$X1,
  [Parameter(Mandatory=$true)][int]$Y1,
  [Parameter(Mandatory=$true)][int]$X2,
  [Parameter(Mandatory=$true)][int]$Y2,
  [int]$Block = 8
)

Add-Type -AssemblyName System.Drawing

$bytes = [System.IO.File]::ReadAllBytes($InPath)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Bitmap]::FromStream($ms)
$g = [System.Drawing.Graphics]::FromImage($img)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

$x = $X1; $y = $Y1; $w = $X2 - $X1; $h = $Y2 - $Y1
if ($w -le 0 -or $h -le 0) { Write-Error "bad rect"; exit 1 }
$sw = [Math]::Max(1, [int]($w / $Block))
$sh = [Math]::Max(1, [int]($h / $Block))
$region = New-Object System.Drawing.Bitmap $w, $h
$rg = [System.Drawing.Graphics]::FromImage($region)
$rg.DrawImage($img, (New-Object System.Drawing.Rectangle 0,0,$w,$h), (New-Object System.Drawing.Rectangle $x,$y,$w,$h), [System.Drawing.GraphicsUnit]::Pixel)
$rg.Dispose()
$small = New-Object System.Drawing.Bitmap $sw, $sh
$sg = [System.Drawing.Graphics]::FromImage($small)
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sg.DrawImage($region, 0, 0, $sw, $sh)
$sg.Dispose()
$g.DrawImage($small, (New-Object System.Drawing.Rectangle $x,$y,$w,$h))
$region.Dispose(); $small.Dispose()
$g.Dispose()

$img.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose(); $ms.Dispose()
Write-Output ("blurred [{0},{1},{2},{3}] -> {4}" -f $x,$y,$X2,$Y2,$OutPath)
