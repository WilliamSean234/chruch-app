# Tes bentrok jadwal lewat API (tanpa UI).
# Syarat: `npm run dev` sedang berjalan di terminal lain.
# Jalankan:  powershell -ExecutionPolicy Bypass -File .\scripts\test-konflik.ps1 -Email admin@... -Password ...
param(
  [Parameter(Mandatory = $true)][string]$Email,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Date = "2026-11-29"   # Minggu; ibadah I 07:00, ibadah II dan Mandarin sama-sama 09:30
)
$ErrorActionPreference = "Stop"
$script:Token = $null
$script:Fail = 0

function Api($Method, $Path, $Body = $null) {
  $req = @{ Uri = "$BaseUrl$Path"; Method = $Method; ContentType = "application/json; charset=utf-8" }
  if ($script:Token) { $req.Headers = @{ Authorization = "Bearer $($script:Token)" } }
  if ($null -ne $Body) { $req.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 6)) }
  try {
    $r = Invoke-RestMethod @req
    return [pscustomobject]@{ Ok = $true; Status = 200; Data = $r; Raw = "" }
  } catch {
    $status = 0; $text = ""
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $text = $_.ErrorDetails.Message
      if (-not $text) { try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $text = $sr.ReadToEnd() } catch {} }
    } else { $text = $_.Exception.Message }
    $data = $null; try { $data = $text | ConvertFrom-Json } catch {}
    return [pscustomobject]@{ Ok = $false; Status = $status; Data = $data; Raw = $text }
  }
}
function Check($name, $cond, $detail = "") {
  if ($cond) { Write-Host "  [LULUS] $name" -ForegroundColor Green }
  else { Write-Host "  [GAGAL] $name $detail" -ForegroundColor Red; $script:Fail++ }
}
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function PickSeat($ev) {
  $s = $ev.seats | Where-Object { $_.ministryName -eq "Keyboard" -and -not $_.person } | Select-Object -First 1
  if (-not $s) { $s = $ev.seats | Where-Object { -not $_.person } | Select-Object -First 1 }
  return $s
}

Step "1. Login"
$login = Api POST "/api/v1/auth/token" @{ email = $Email; password = $Password }
Check "Login berhasil" $login.Ok $login.Raw
if (-not $login.Ok) { exit 1 }
$script:Token = $login.Data.token

Step "2. Buat acara $Date dari template (ibadah II dan Mandarin)"
$tpls = (Api GET "/api/v1/templates").Data.items
$t2 = $tpls | Where-Object { $_.name -like "*Minggu II*" } | Select-Object -First 1
$tm = $tpls | Where-Object { $_.name -like "*Mandarin*" } | Select-Object -First 1
Check "Template ditemukan" ($t2 -and $tm) "(nama template: $(($tpls | ForEach-Object name) -join ', '))"
foreach ($t in @($t2, $tm)) {
  $g = Api POST "/api/v1/templates/$($t.id)/generate" @{ from = $Date; to = $Date }
  Check "Generate $($t.name)" $g.Ok $g.Raw
}
$list = (Api GET "/api/v1/events?from=$Date&to=$Date").Data.items
$e2 = $list | Where-Object { $_.title -like "*Minggu II*" -and $_.status -ne "CANCELLED" } | Select-Object -First 1
$em = $list | Where-Object { $_.title -like "*Mandarin*" -and $_.status -ne "CANCELLED" } | Select-Object -First 1
Check "Kedua acara ada" ($e2 -and $em)
if (-not ($e2 -and $em)) { exit 1 }
Write-Host "  $($e2.number) $($e2.title) | $($em.number) $($em.title)"
$ev2 = Api GET "/api/v1/events/$($e2.id)"; $evm = Api GET "/api/v1/events/$($em.id)"
$seat2 = PickSeat $ev2.Data; $seatm = PickSeat $evm.Data
Check "Ada kursi kosong di kedua acara" ($seat2 -and $seatm)
if (-not ($seat2 -and $seatm)) { exit 1 }

Step "3. Siapkan orang uji"
$found = (Api GET "/api/v1/persons?search=Tes%20Bentrok").Data.items | Select-Object -First 1
if (-not $found) {
  $pos = (Api GET "/api/v1/lookups/positions").Data.items | Select-Object -First 1
  $c = Api POST "/api/v1/persons" @{ name = "Tes Bentrok"; gender = "L"; positionId = $pos.id }
  Check "Orang uji dibuat" $c.Ok $c.Raw
  $found = $c.Data
}
$pid1 = $found.id
Write-Host "  Orang uji: $($found.name)"

Step "4. Isi kursi acara ibadah II (harus berhasil)"
$a1 = Api PUT "/api/v1/events/$($e2.id)/seats/$($seat2.id)/person" @{ personId = $pid1 }
Check "Berhasil diisi" $a1.Ok $a1.Raw

Step "5. Isi orang yang sama di Mandarin, jam sama (harus DITOLAK)"
$a2 = Api PUT "/api/v1/events/$($em.id)/seats/$($seatm.id)/person" @{ personId = $pid1 }
Check "Ditolak dengan status 409" ($a2.Status -eq 409) "(status $($a2.Status))"
Check "Kode PERSON_CONFLICT" ($a2.Data.error.code -eq "PERSON_CONFLICT")
Write-Host "  Pesan: $($a2.Data.error.message)" -ForegroundColor Yellow
Write-Host "  Bisa override? $($a2.Data.error.details.canOverride)"

Step "6. Suggestion kursi Mandarin: orang uji harus masuk 'tidak tersedia'"
$sg = Api GET "/api/v1/events/$($em.id)/seats/$($seatm.id)/suggestions?includeOthers=true&search=Tes"
$inUn = $sg.Data.unavailable | Where-Object { $_.id -eq $pid1 }
$inAv = $sg.Data.available | Where-Object { $_.id -eq $pid1 }
Check "Ada di daftar tidak tersedia" ($null -ne $inUn)
Check "Tidak ada di daftar tersedia" ($null -eq $inAv)
if ($inUn) { Write-Host "  Alasan: $($inUn.conflicts -join '; ')" -ForegroundColor Yellow }

Step "7. Rangkap dua posisi di acara yang SAMA (harus DITOLAK)"
$other = $ev2.Data.seats | Where-Object { $_.id -ne $seat2.id -and -not $_.person } | Select-Object -First 1
if ($other) {
  $a3 = Api PUT "/api/v1/events/$($e2.id)/seats/$($other.id)/person" @{ personId = $pid1 }
  Check "Ditolak (orang sama, dua posisi, satu acara)" ($a3.Status -eq 409) "(status $($a3.Status))"
  Write-Host "  Pesan: $($a3.Data.error.message)" -ForegroundColor Yellow
}

Step "8. Override Superadmin dengan alasan (harus berhasil)"
$a4 = Api PUT "/api/v1/events/$($em.id)/seats/$($seatm.id)/person" @{ personId = $pid1; override = @{ reason = "Tes override dari skrip" } }
Check "Override diterima" $a4.Ok $a4.Raw

Step "9. Bersihkan: kosongkan kursi dan hapus orang uji"
$null = Api PUT "/api/v1/events/$($em.id)/seats/$($seatm.id)/person" @{ personId = $null }
$null = Api PUT "/api/v1/events/$($e2.id)/seats/$($seat2.id)/person" @{ personId = $null }
$del = Api DELETE "/api/v1/persons/$pid1"
Check "Orang uji dihapus" $del.Ok $del.Raw

Write-Host ""
if ($script:Fail -eq 0) { Write-Host "SEMUA TES LULUS" -ForegroundColor Green } else { Write-Host "$($script:Fail) TES GAGAL" -ForegroundColor Red }
Write-Host "Acara tes ($($e2.number), $($em.number)) tetap ada sebagai DRAFT; batalkan lewat POST /api/v1/events/{id}/cancel bila tidak dipakai."
