# Builds installer-sidebar-dark.bmp - the full-bleed dark artwork for the NSIS
# Welcome/Finish pages, so those pages match the branding rather than showing a
# narrow strip beside a white body.
#
# MUI2 normally paints this bitmap into a 164x314 control on the left. The
# installer resizes that control to cover the whole page and re-stretches the
# bitmap into it (see TnbApplyDarkPage in installer.nsi), so this image is
# generated at the full page size instead of the sidebar size.
#
# Source is wix-dialog.bmp - the same artwork the MSI used, which is the look
# that was signed off. 493x312 -> 497x314 is a 0.8% stretch on a smooth
# gradient and is not perceptible.
#
#   pwsh -File make-nsis-sidebar-dark.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $here 'wix-dialog.bmp'
$out    = Join-Path $here 'installer-sidebar-dark.bmp'

# The MUI Welcome/Finish page client area, measured from a running installer at
# 100% DPI. The runtime re-stretch handles other DPI scalings.
$W = 497; $H = 314

$src = [System.Drawing.Bitmap]::FromFile($source)
try {
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $W, $H)))
  } finally { $g.Dispose() }
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)

  # Report the colour of the far edge - installer.nsi paints the page background
  # this colour as a fallback, so the two must agree.
  $c = $bmp.GetPixel($W - 2, [int]($H / 2))
  Write-Output ("wrote {0} ({1}x{2}, {3:N0} bytes)" -f (Split-Path -Leaf $out), $W, $H, (Get-Item $out).Length)
  Write-Output ("far-edge colour: RGB({0},{1},{2})  -> NSIS 0x{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B)
  $bmp.Dispose()
} finally { $src.Dispose() }
