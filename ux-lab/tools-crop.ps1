Add-Type -AssemblyName System.Drawing
$src='C:\Users\berna\Downloads\ChatGPT Image Sep 26, 2026, 01_57_38 PM.png'
$out='C:\Users\berna\Projects\cruvit-ux-home-worktree\ux-lab\assets'
$img=[System.Drawing.Bitmap]::FromFile($src)

function Save-Crop($name,$x,$y,$w,$h,$radius) {
  $bmp=[System.Drawing.Bitmap]::new($w,$h,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $path=[System.Drawing.Drawing2D.GraphicsPath]::new()
  $d=$radius*2
  $path.AddArc(0,0,$d,$d,180,90)
  $path.AddArc($w-$d,0,$d,$d,270,90)
  $path.AddArc($w-$d,$h-$d,$d,$d,0,90)
  $path.AddArc(0,$h-$d,$d,$d,90,90)
  $path.CloseFigure()
  $g.SetClip($path)
  $dest=[System.Drawing.Rectangle]::new(0,0,$w,$h)
  $source=[System.Drawing.Rectangle]::new($x,$y,$w,$h)
  $g.DrawImage($img,$dest,$source,[System.Drawing.GraphicsUnit]::Pixel)
  $g.ResetClip()
  $g.Dispose()
  $bmp.Save((Join-Path $out $name),[System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $path.Dispose()
}

Save-Crop 'card-garden-design.png' 0 565 282 565 38
Save-Crop 'card-my-garden.png' 247 467 433 728 48
Save-Crop 'card-plant-doctor.png' 687 576 254 552 38
$img.Dispose()
Write-Output 'cropped-ok'