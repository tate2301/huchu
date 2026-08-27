$os = Get-CimInstance Win32_OperatingSystem
Write-Host "=== MEMORY / COMMIT ==="
Write-Host ("TotalRAM_GB    : {0:N2}" -f ($os.TotalVisibleMemorySize/1MB))
Write-Host ("FreeRAM_GB     : {0:N2}" -f ($os.FreePhysicalMemory/1MB))
Write-Host ("CommitLimit_GB : {0:N2}" -f ($os.TotalVirtualMemorySize/1MB))
Write-Host ("CommitUsed_GB  : {0:N2}" -f (($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB))
Write-Host ("CommitFree_GB  : {0:N2}" -f ($os.FreeVirtualMemory/1MB))

Write-Host ""
Write-Host "=== PAGEFILE CONFIG ==="
$cs = Get-CimInstance Win32_ComputerSystem
Write-Host ("AutomaticManagedPagefile : {0}" -f $cs.AutomaticManagedPagefile)
Get-CimInstance Win32_PageFileSetting -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("Setting: {0}  Initial={1}MB  Max={2}MB" -f $_.Name, $_.InitialSize, $_.MaximumSize)
}
Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("Usage:   {0}  Allocated={1}MB  CurrentUsage={2}MB  Peak={3}MB" -f $_.Name, $_.AllocatedBaseSize, $_.CurrentUsage, $_.PeakUsage)
}

Write-Host ""
Write-Host "=== DISK FREE (pagefile growth headroom) ==="
Get-PSDrive C | ForEach-Object { Write-Host ("C: free {0:N1} GB" -f ($_.Free/1GB)) }

Write-Host ""
Write-Host "=== TOP 12 PROCESSES BY PRIVATE BYTES (commit consumers) ==="
Get-Process | Sort-Object PrivateMemorySize64 -Descending | Select-Object -First 12 Id,ProcessName,
  @{n='PrivateMB';e={[math]::Round($_.PrivateMemorySize64/1MB)}},
  @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB)}} | Format-Table -AutoSize

Write-Host "=== NODE PROCESS COUNT + TOTAL PRIVATE ==="
$nodes = Get-Process node -ErrorAction SilentlyContinue
Write-Host ("count={0}  totalPrivate_GB={1:N2}" -f ($nodes | Measure-Object).Count, (($nodes | Measure-Object PrivateMemorySize64 -Sum).Sum/1GB))
Write-Host ""
Write-Host "=== NODE COMMAND LINES (who are these) ==="
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $c = $_.CommandLine
  if ($c) { if ($c.Length -gt 110) { $c = $c.Substring(0,110) + "..." } }
  Write-Host ("pid={0}  {1}" -f $_.ProcessId, $c)
}
