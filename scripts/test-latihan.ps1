# Tes sesi latihan lewat API (tanpa UI).
# Syarat: `npm run dev` sedang berjalan di terminal lain.
# Jalankan:  powershell -ExecutionPolicy Bypass -File .\scripts\test-latihan.ps1 -Email admin@... -Password ...
param(
  [Parameter(Mandatory = $true)][string]$Email,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Date = "2026-11-29"   # Minggu: ibadah II (acara utama)
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
function PickSeat($ev, $wajib) {
  $s = $ev.seats | Where-Object { $_.rehearsalRequired -eq $wajib -and -not $_.person } | Select-Object -First 1
  if (-not $s) { $s = $ev.seats | Where-Object { -not $_.person } | Select-Object -First 1 }
  return $s
}
function GenerateAndFind($tplLike, $day) {
  $t = (Api GET "/api/v1/templates").Data.items | Where-Object { $_.name -like $tplLike } | Select-Object -First 1
  $null = Api POST "/api/v1/templates/$($t.id)/generate" @{ from = $day; to = $day }
  $e = (Api GET "/api/v1/events?from=$day&to=$day").Data.items | Where-Object { $_.title -like $tplLike -and $_.status -ne "CANCELLED" } | Select-Object -First 1
  return $e
}

Step "1. Login"
$login = Api POST "/api/v1/auth/token" @{ email = $Email; password = $Password }
Check "Login berhasil" $login.Ok $login.Raw
if (-not $login.Ok) { exit 1 }
$script:Token = $login.Data.token

Step "2. Siapkan: ibadah II (29 Nov) dan ibadah I (22 Nov, 07:00-09:00)"
$main = GenerateAndFind "*Minggu II*" $Date
$other = GenerateAndFind "*Minggu I" "2026-11-22"
if (-not $other) { $other = GenerateAndFind "*Minggu I*" "2026-11-22" }
Check "Kedua acara ada" ($main -and $other)
if (-not ($main -and $other)) { exit 1 }
$evMain = (Api GET "/api/v1/events/$($main.id)").Data
$evOther = (Api GET "/api/v1/events/$($other.id)").Data
$seatMain = PickSeat $evMain $true
$seatOther = PickSeat $evOther $false
Check "Kursi wajib-latihan kosong ada di ibadah II" ($seatMain -and $seatMain.rehearsalRequired) "(posisi: $($seatMain.label), wajib: $($seatMain.rehearsalRequired))"
$rooms = (Api GET "/api/v1/lookups/rooms").Data.items
$roomB = $rooms | Where-Object { $_.name -like "*B*" } | Select-Object -First 1
if (-not $roomB) { $roomB = $rooms | Select-Object -Last 1 }

Step "3. Orang uji ditugaskan di KEDUA acara"
$found = (Api GET "/api/v1/persons?search=Tes%20Latihan").Data.items | Select-Object -First 1
if (-not $found) {
  $pos = (Api GET "/api/v1/lookups/positions").Data.items | Select-Object -First 1
  $found = (Api POST "/api/v1/persons" @{ name = "Tes Latihan"; gender = "P"; positionId = $pos.id }).Data
}
$p1 = $found.id
$r = Api PUT "/api/v1/events/$($main.id)/seats/$($seatMain.id)/person" @{ personId = $p1 }
Check "Ditugaskan di ibadah II (wajib latihan)" $r.Ok $r.Raw
$r = Api PUT "/api/v1/events/$($other.id)/seats/$($seatOther.id)/person" @{ personId = $p1 }
Check "Ditugaskan di ibadah I (22 Nov)" $r.Ok $r.Raw

Step "4. Latihan ibadah II tgl 22 Nov 07:30 -> orang uji sedang bertugas di ibadah I (harus DITOLAK)"
$bad = Api POST "/api/v1/events/$($main.id)/rehearsals" @{ date = "2026-11-22"; startTime = "07:30"; durationMin = 60; roomId = $roomB.id }
Check "Ditolak 409 REHEARSAL_CONFLICT" ($bad.Status -eq 409 -and $bad.Data.error.code -eq "REHEARSAL_CONFLICT") "(status $($bad.Status))"
Write-Host "  Pesan: $($bad.Data.error.message)" -ForegroundColor Yellow

Step "5. Matikan 'wajib latihan' untuk kursi itu, lalu buat latihan yang sama (harus BERHASIL)"
$off = Api PUT "/api/v1/events/$($main.id)/seats/$($seatMain.id)/rehearsal" @{ required = $false }
Check "Wajib latihan dimatikan" ($off.Ok -and $off.Data.changed) $off.Raw
$good = Api POST "/api/v1/events/$($main.id)/rehearsals" @{ date = "2026-11-22"; startTime = "07:30"; durationMin = 60; roomId = $roomB.id; note = "Latihan tes" }
Check "Latihan dibuat" $good.Ok $good.Raw
$rid = $good.Data.id
$sess = (Api GET "/api/v1/events/$($main.id)/rehearsals").Data
Check "Ada 1 sesi, peserta tercatat tidak wajib" ($sess.sessions.Count -ge 1 -and ($sess.participants | Where-Object { $_.person.id -eq $p1 }).rehearsalRequired -eq $false)

Step "6. Nyalakan lagi 'wajib latihan' -> bentrok dengan tugas ibadah I (harus DITOLAK)"
$on = Api PUT "/api/v1/events/$($main.id)/seats/$($seatMain.id)/rehearsal" @{ required = $true }
Check "Ditolak 409" ($on.Status -eq 409) "(status $($on.Status))"
Write-Host "  Pesan: $($on.Data.error.message)" -ForegroundColor Yellow

Step "7. Tombol massal: nonaktifkan wajib latihan untuk satu tim penuh"
$teamId = $seatMain.teamTypeId
$bulk = Api PUT "/api/v1/events/$($main.id)/rehearsal-required" @{ required = $false; teamTypeId = $teamId }
Check "Massal berjalan" $bulk.Ok $bulk.Raw
Write-Host "  Diubah: $($bulk.Data.updated), tidak berubah: $($bulk.Data.unchanged), terblokir: $($bulk.Data.blocked.Count)"
$bulk2 = Api PUT "/api/v1/events/$($main.id)/rehearsal-required" @{ required = $true; teamTypeId = $teamId }
Check "Massal nyalakan: kursi orang uji terblokir, sisanya berubah" ($bulk2.Ok -and ($bulk2.Data.blocked | Where-Object { $_.person -eq "Tes Latihan" }))
Write-Host "  Diubah: $($bulk2.Data.updated), terblokir: $($bulk2.Data.blocked.Count)"

Step "8. Bersihkan"
$null = Api DELETE "/api/v1/events/$($main.id)/rehearsals/$rid"
$null = Api PUT "/api/v1/events/$($main.id)/rehearsal-required" @{ required = $true; teamTypeId = $teamId }
$null = Api PUT "/api/v1/events/$($main.id)/seats/$($seatMain.id)/person" @{ personId = $null }
$null = Api PUT "/api/v1/events/$($other.id)/seats/$($seatOther.id)/person" @{ personId = $null }
$del = Api DELETE "/api/v1/persons/$p1"
Check "Orang uji dihapus" $del.Ok $del.Raw

Write-Host ""
if ($script:Fail -eq 0) { Write-Host "SEMUA TES LULUS" -ForegroundColor Green } else { Write-Host "$($script:Fail) TES GAGAL" -ForegroundColor Red }
