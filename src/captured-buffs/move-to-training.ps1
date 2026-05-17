$src = $PSScriptRoot
$dst = Join-Path $PSScriptRoot "..\attuner-buffs"

foreach ($file in Get-ChildItem -Path $src -Filter "*.png") {
    if ($file.BaseName -match '^(.+)_([^_]+)_(\d+)$') {
        $rune   = $Matches[1]
        $charge = $Matches[2]
        $prefix = "${rune}_${charge}_"

        $maxIndex = -1
        foreach ($ex in Get-ChildItem -Path $dst -Filter "${prefix}*.png" -ErrorAction SilentlyContinue) {
            if ($ex.BaseName -match '_(\d+)$') {
                $idx = [int]$Matches[1]
                if ($idx -gt $maxIndex) { $maxIndex = $idx }
            }
        }

        $newName = "${prefix}$($maxIndex + 1).png"
        Move-Item -Path $file.FullName -Destination (Join-Path $dst $newName)
        Write-Host "Moved: $($file.Name) -> $newName"
    } else {
        Write-Warning "Skipping unrecognised filename: $($file.Name)"
    }
}

Write-Host "`nDone."
