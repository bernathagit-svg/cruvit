Add-Type -AssemblyName System.Drawing
$src='C:\Users\berna\Downloads\ChatGPT Image Sep 26, 2026, 12_51_26 PM.png'
$img=[System.Drawing.Image]::FromFile($src)
Write-Output ($img.Width.ToString()+'x'+$img.Height.ToString())
$img.Dispose()