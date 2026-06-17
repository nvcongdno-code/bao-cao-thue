$ErrorActionPreference = "Stop"

$communesList = @(
    @{ name="\u0058\u00e3\u0020\u0110\u1eaf\u006b\u0020\u0057\u0069\u006c"; code="dak_wil"; row=9 }
    @{ name="\u0058\u00e3\u0020\u004e\u00e2\u006d\u0020\u004e\u0027\u0110\u0069\u0072"; code="nam_dong"; row=10 }
    @{ name="\u0058\u00e3\u0020\u0043\u01b0\u0020\u004a\u00fa\u0074"; code="cu_jut"; row=11 }
    @{ name="\u0058\u00e3\u0020\u004e\u00e2\u006d\u0020\u004e\u0027\u0110\u0069\u0061"; code="nam_da"; row=12 }
    @{ name="\u0058\u00e3\u0020\u004b\u0072\u00f4\u006e\u0067\u0020\u004e\u00f4"; code="krong_no"; row=13 }
    @{ name="\u0058\u00e3\u0020\u004e\u00e2\u006d\u0020\u004e\u0075\u006e\u0067"; code="nam_nung"; row=14 }
    @{ name="\u0058\u00e3\u0020\u0051\u0075\u1ea3\u006e\u0067\u0020\u0050\u0068\u00fa"; code="quang_phu"; row=15 }
)

$targetPath = "d:\3Thue\Data\DuToan_2026.xlsx"

# Find actual file dynamically
$files = Get-ChildItem "d:\3Thue\Data" -Filter "*.xlsx"
$actualPath = $null
foreach ($f in $files) {
    if ($f.Name -notlike "*DuToan*") {
        $actualPath = $f.FullName
        break
    }
}
if ($null -eq $actualPath) {
    Write-Error "Actual file not found"
    exit
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    Write-Host "Opening target file: $targetPath"
    $wbTarget = $excel.Workbooks.Open($targetPath)
    $sProvTarget = $wbTarget.Sheets.Item(1)
    $sBaseTarget = $wbTarget.Sheets.Item(2)
    
    Write-Host "Opening actual file: $actualPath"
    $wbActual = $excel.Workbooks.Open($actualPath)
    $sProvActual = $wbActual.Sheets.Item(3)
    $sBaseActual = $wbActual.Sheets.Item(4)
    $sSummaryActual = $wbActual.Sheets.Item(1)
    
    # Extract report date from Sheet 1, Row 4, Col 2 in actuals
    $dateText = $sSummaryActual.Cells.Item(4, 2).Text.Trim()
    $reportDate = "2026-06-15"
    if ($dateText -match "(\d+)/(\d+)/(\d+)") {
        $day = $Matches[1].PadLeft(2, '0')
        $month = $Matches[2].PadLeft(2, '0')
        $year = $Matches[3]
        $reportDate = "$year-$month-$day"
    }
    Write-Host "Report date: $reportDate"

    function Get-Num($s, $r, $c) {
        $v = $s.Cells.Item($r, $c).Value2
        if ($null -eq $v -or $v -eq "") { return 0.0 }
        return [double]$v
    }
    
    $mult = 1000000
    
    $communesData = @()
    
    foreach ($c in $communesList) {
        $r = $c.row
        $code = $c.code
        $name = $c.name
        
        Write-Host "Processing commune: $code (Row $r)"
        
        # --- PROVINCE TAX ---
        # Targets (from DuToan_2026.xlsx Sheet 1)
        $p_t_land = (Get-Num $sProvTarget $r 37) * $mult
        $p_t_central = ((Get-Num $sProvTarget $r 8) + (Get-Num $sProvTarget $r 9) + (Get-Num $sProvTarget $r 10)) * $mult
        $p_t_local = ((Get-Num $sProvTarget $r 11) + (Get-Num $sProvTarget $r 12) + (Get-Num $sProvTarget $r 13) + (Get-Num $sProvTarget $r 14)) * $mult
        $p_t_fdi = ((Get-Num $sProvTarget $r 15) + (Get-Num $sProvTarget $r 16) + (Get-Num $sProvTarget $r 17) + (Get-Num $sProvTarget $r 18)) * $mult
        $p_t_nqd = ((Get-Num $sProvTarget $r 19) + (Get-Num $sProvTarget $r 20) + (Get-Num $sProvTarget $r 21) + (Get-Num $sProvTarget $r 22)) * $mult
        $p_t_pit = (Get-Num $sProvTarget $r 30) * $mult
        $p_t_reg = (Get-Num $sProvTarget $r 32) * $mult
        $p_t_landNonAgri = (Get-Num $sProvTarget $r 35) * $mult
        $p_t_landRent = (Get-Num $sProvTarget $r 36) * $mult
        $p_t_minerals = (Get-Num $sProvTarget $r 40) * $mult
        $p_t_otherBudget = (Get-Num $sProvTarget $r 43) * $mult
        
        $p_t_total = (Get-Num $sProvTarget $r 3) * $mult
        if ($p_t_total -le 0) {
            $p_t_total = $p_t_land + $p_t_central + $p_t_local + $p_t_fdi + $p_t_nqd + $p_t_pit + $p_t_reg + $p_t_landNonAgri + $p_t_landRent + $p_t_minerals + $p_t_otherBudget
        }
        $p_t_sum11 = $p_t_land + $p_t_central + $p_t_local + $p_t_fdi + $p_t_nqd + $p_t_pit + $p_t_reg + $p_t_landNonAgri + $p_t_landRent + $p_t_minerals + $p_t_otherBudget
        $p_t_oth = [math]::Max(0.0, $p_t_total - $p_t_sum11)

        # Actual YTD (from Chi tiết xã, phường tháng 15.06.2026.xlsx Sheet 3)
        $p_a_land = (Get-Num $sProvActual $r 37) * $mult
        $p_a_central = ((Get-Num $sProvActual $r 8) + (Get-Num $sProvActual $r 9) + (Get-Num $sProvActual $r 10)) * $mult
        $p_a_local = ((Get-Num $sProvActual $r 11) + (Get-Num $sProvActual $r 12) + (Get-Num $sProvActual $r 13) + (Get-Num $sProvActual $r 14)) * $mult
        $p_a_fdi = ((Get-Num $sProvActual $r 15) + (Get-Num $sProvActual $r 16) + (Get-Num $sProvActual $r 17) + (Get-Num $sProvActual $r 18)) * $mult
        $p_a_nqd = ((Get-Num $sProvActual $r 19) + (Get-Num $sProvActual $r 20) + (Get-Num $sProvActual $r 21) + (Get-Num $sProvActual $r 22)) * $mult
        $p_a_pit = (Get-Num $sProvActual $r 30) * $mult
        $p_a_reg = (Get-Num $sProvActual $r 32) * $mult
        $p_a_landNonAgri = (Get-Num $sProvActual $r 35) * $mult
        $p_a_landRent = (Get-Num $sProvActual $r 36) * $mult
        $p_a_minerals = (Get-Num $sProvActual $r 40) * $mult
        $p_a_otherBudget = (Get-Num $sProvActual $r 43) * $mult
        
        $p_a_total = (Get-Num $sProvActual $r 3) * $mult
        $p_a_sum11 = $p_a_land + $p_a_central + $p_a_local + $p_a_fdi + $p_a_nqd + $p_a_pit + $p_a_reg + $p_a_landNonAgri + $p_a_landRent + $p_a_minerals + $p_a_otherBudget
        $p_a_oth = [math]::Max(0.0, $p_a_total - $p_a_sum11)

        $p_last_total = (Get-Num $sProvActual $r 4) * $mult
        $p_ratio = if ($p_a_total -gt 0) { $p_last_total / $p_a_total } else { 0.90 }
        
        $p_l_land = $p_a_land * $p_ratio
        $p_l_central = $p_a_central * $p_ratio
        $p_l_local = $p_a_local * $p_ratio
        $p_l_fdi = $p_a_fdi * $p_ratio
        $p_l_nqd = $p_a_nqd * $p_ratio
        $p_l_pit = $p_a_pit * $p_ratio
        $p_l_reg = $p_a_reg * $p_ratio
        $p_l_landNonAgri = $p_a_landNonAgri * $p_ratio
        $p_l_landRent = $p_a_landRent * $p_ratio
        $p_l_minerals = $p_a_minerals * $p_ratio
        $p_l_otherBudget = $p_a_otherBudget * $p_ratio
        $p_l_oth = $p_a_oth * $p_ratio


        # --- BASE TAX ---
        # Targets (from DuToan_2026.xlsx Sheet 2)
        $b_t_land = (Get-Num $sBaseTarget $r 37) * $mult
        $b_t_central = ((Get-Num $sBaseTarget $r 8) + (Get-Num $sBaseTarget $r 9) + (Get-Num $sBaseTarget $r 10)) * $mult
        $b_t_local = ((Get-Num $sBaseTarget $r 11) + (Get-Num $sBaseTarget $r 12) + (Get-Num $sBaseTarget $r 13) + (Get-Num $sBaseTarget $r 14)) * $mult
        $b_t_fdi = ((Get-Num $sBaseTarget $r 15) + (Get-Num $sBaseTarget $r 16) + (Get-Num $sBaseTarget $r 17) + (Get-Num $sBaseTarget $r 18)) * $mult
        $b_t_nqd = ((Get-Num $sBaseTarget $r 19) + (Get-Num $sBaseTarget $r 20) + (Get-Num $sBaseTarget $r 21) + (Get-Num $sBaseTarget $r 22)) * $mult
        $b_t_pit = (Get-Num $sBaseTarget $r 30) * $mult
        $b_t_reg = (Get-Num $sBaseTarget $r 32) * $mult
        $b_t_landNonAgri = (Get-Num $sBaseTarget $r 35) * $mult
        $b_t_landRent = (Get-Num $sBaseTarget $r 36) * $mult
        $b_t_minerals = (Get-Num $sBaseTarget $r 40) * $mult
        $b_t_otherBudget = (Get-Num $sBaseTarget $r 43) * $mult
        
        $b_t_total = (Get-Num $sBaseTarget $r 3) * $mult
        if ($b_t_total -le 0) {
            $b_t_total = $b_t_land + $b_t_central + $b_t_local + $b_t_fdi + $b_t_nqd + $b_t_pit + $b_t_reg + $b_t_landNonAgri + $b_t_landRent + $b_t_minerals + $b_t_otherBudget
        }
        $b_t_sum11 = $b_t_land + $b_t_central + $b_t_local + $b_t_fdi + $b_t_nqd + $b_t_pit + $b_t_reg + $b_t_landNonAgri + $b_t_landRent + $b_t_minerals + $b_t_otherBudget
        $b_t_oth = [math]::Max(0.0, $b_t_total - $b_t_sum11)

        # Actual YTD (from Chi tiết xã, phường tháng 15.06.2026.xlsx Sheet 4)
        $b_a_land = (Get-Num $sBaseActual $r 37) * $mult
        $b_a_central = ((Get-Num $sBaseActual $r 8) + (Get-Num $sBaseActual $r 9) + (Get-Num $sBaseActual $r 10)) * $mult
        $b_a_local = ((Get-Num $sBaseActual $r 11) + (Get-Num $sBaseActual $r 12) + (Get-Num $sBaseActual $r 13) + (Get-Num $sBaseActual $r 14)) * $mult
        $b_a_fdi = ((Get-Num $sBaseActual $r 15) + (Get-Num $sBaseActual $r 16) + (Get-Num $sBaseActual $r 17) + (Get-Num $sBaseActual $r 18)) * $mult
        $b_a_nqd = ((Get-Num $sBaseActual $r 19) + (Get-Num $sBaseActual $r 20) + (Get-Num $sBaseActual $r 21) + (Get-Num $sBaseActual $r 22)) * $mult
        $b_a_pit = (Get-Num $sBaseActual $r 30) * $mult
        $b_a_reg = (Get-Num $sBaseActual $r 32) * $mult
        $b_a_landNonAgri = (Get-Num $sBaseActual $r 35) * $mult
        $b_a_landRent = (Get-Num $sBaseActual $r 36) * $mult
        $b_a_minerals = (Get-Num $sBaseActual $r 40) * $mult
        $b_a_otherBudget = (Get-Num $sBaseActual $r 43) * $mult
        
        $b_a_total = (Get-Num $sBaseActual $r 3) * $mult
        $b_a_sum11 = $b_a_land + $b_a_central + $b_a_local + $b_a_fdi + $b_a_nqd + $b_a_pit + $b_a_reg + $b_a_landNonAgri + $b_a_landRent + $b_a_minerals + $b_a_otherBudget
        $b_a_oth = [math]::Max(0.0, $b_a_total - $b_a_sum11)

        $b_last_total = (Get-Num $sBaseActual $r 4) * $mult
        $b_ratio = if ($b_a_total -gt 0) { $b_last_total / $b_a_total } else { 0.90 }
        
        $b_l_land = $b_a_land * $b_ratio
        $b_l_central = $b_a_central * $b_ratio
        $b_l_local = $b_a_local * $b_ratio
        $b_l_fdi = $b_a_fdi * $b_ratio
        $b_l_nqd = $b_a_nqd * $b_ratio
        $b_l_pit = $b_a_pit * $b_ratio
        $b_l_reg = $b_a_reg * $b_ratio
        $b_l_landNonAgri = $b_a_landNonAgri * $b_ratio
        $b_l_landRent = $b_a_landRent * $b_ratio
        $b_l_minerals = $b_a_minerals * $b_ratio
        $b_l_otherBudget = $b_a_otherBudget * $b_ratio
        $b_l_oth = $b_a_oth * $b_ratio

        $p_today_total = 0
        $b_today_total = 0

        $communesData += @{
            id = $code
            name = $name
            provinceTax = @{
                target = [math]::Round($p_t_total)
                today = [math]::Round($p_today_total)
                ytd = [math]::Round($p_a_total)
                lastYearYtd = [math]::Round($p_last_total)
                details = @{
                    land = @{ target = [math]::Round($p_t_land); ytd = [math]::Round($p_a_land); lastYearYtd = [math]::Round($p_l_land) }
                    enterpriseStateCentral = @{ target = [math]::Round($p_t_central); ytd = [math]::Round($p_a_central); lastYearYtd = [math]::Round($p_l_central) }
                    enterpriseStateLocal = @{ target = [math]::Round($p_t_local); ytd = [math]::Round($p_a_local); lastYearYtd = [math]::Round($p_l_local) }
                    enterpriseForeign = @{ target = [math]::Round($p_t_fdi); ytd = [math]::Round($p_a_fdi); lastYearYtd = [math]::Round($p_l_fdi) }
                    enterpriseNonState = @{ target = [math]::Round($p_t_nqd); ytd = [math]::Round($p_a_nqd); lastYearYtd = [math]::Round($p_l_nqd) }
                    pit = @{ target = [math]::Round($p_t_pit); ytd = [math]::Round($p_a_pit); lastYearYtd = [math]::Round($p_l_pit) }
                    registration = @{ target = [math]::Round($p_t_reg); ytd = [math]::Round($p_a_reg); lastYearYtd = [math]::Round($p_l_reg) }
                    landNonAgri = @{ target = [math]::Round($p_t_landNonAgri); ytd = [math]::Round($p_a_landNonAgri); lastYearYtd = [math]::Round($p_l_landNonAgri) }
                    landRent = @{ target = [math]::Round($p_t_landRent); ytd = [math]::Round($p_a_landRent); lastYearYtd = [math]::Round($p_l_landRent) }
                    minerals = @{ target = [math]::Round($p_t_minerals); ytd = [math]::Round($p_a_minerals); lastYearYtd = [math]::Round($p_l_minerals) }
                    otherBudget = @{ target = [math]::Round($p_t_otherBudget); ytd = [math]::Round($p_a_otherBudget); lastYearYtd = [math]::Round($p_l_otherBudget) }
                    others = @{ target = [math]::Round($p_t_oth); ytd = [math]::Round($p_a_oth); lastYearYtd = [math]::Round($p_l_oth) }
                }
            }
            baseTax = @{
                target = [math]::Round($b_t_total)
                today = [math]::Round($b_today_total)
                ytd = [math]::Round($b_a_total)
                lastYearYtd = [math]::Round($b_last_total)
                details = @{
                    land = @{ target = [math]::Round($b_t_land); ytd = [math]::Round($b_a_land); lastYearYtd = [math]::Round($b_l_land) }
                    enterpriseStateCentral = @{ target = [math]::Round($b_t_central); ytd = [math]::Round($b_a_central); lastYearYtd = [math]::Round($b_l_central) }
                    enterpriseStateLocal = @{ target = [math]::Round($b_t_local); ytd = [math]::Round($b_a_local); lastYearYtd = [math]::Round($b_l_local) }
                    enterpriseForeign = @{ target = [math]::Round($b_t_fdi); ytd = [math]::Round($b_a_fdi); lastYearYtd = [math]::Round($b_l_fdi) }
                    enterpriseNonState = @{ target = [math]::Round($b_t_nqd); ytd = [math]::Round($b_a_nqd); lastYearYtd = [math]::Round($b_l_nqd) }
                    pit = @{ target = [math]::Round($b_t_pit); ytd = [math]::Round($b_a_pit); lastYearYtd = [math]::Round($b_l_pit) }
                    registration = @{ target = [math]::Round($b_t_reg); ytd = [math]::Round($b_a_reg); lastYearYtd = [math]::Round($b_l_reg) }
                    landNonAgri = @{ target = [math]::Round($b_t_landNonAgri); ytd = [math]::Round($b_a_landNonAgri); lastYearYtd = [math]::Round($b_l_landNonAgri) }
                    landRent = @{ target = [math]::Round($b_t_landRent); ytd = [math]::Round($b_a_landRent); lastYearYtd = [math]::Round($b_l_landRent) }
                    minerals = @{ target = [math]::Round($b_t_minerals); ytd = [math]::Round($b_a_minerals); lastYearYtd = [math]::Round($b_l_minerals) }
                    otherBudget = @{ target = [math]::Round($b_t_otherBudget); ytd = [math]::Round($b_a_otherBudget); lastYearYtd = [math]::Round($b_l_otherBudget) }
                    others = @{ target = [math]::Round($b_t_oth); ytd = [math]::Round($b_a_oth); lastYearYtd = [math]::Round($b_l_oth) }
                }
            }
        }
    }
    
    $wbTarget.Close($false)
    $wbActual.Close($false)

    # Output JS file with escaped Unicode strings
    $jsonBuilder = @()
    $jsonBuilder += '// Budget data for 7 communes'
    $jsonBuilder += '// Generated automatically from targets & actuals Excel files on ' + $reportDate
    $jsonBuilder += ''
    $jsonBuilder += 'const BUDGET_DATA = {'
    $jsonBuilder += '  metadata: {'
    $jsonBuilder += '    province: "\u004c\u00e2\u006d\u0020\u0110\u1ed3\u006e\u0067",'
    $jsonBuilder += '    governingUnit: "\u0043\u1ee5\u0063\u0020\u0054\u0068\u0075\u1ebf\u0020\u0074\u1ec9\u006e\u0068\u0020\u004c\u00e2\u006d\u0020\u0110\u1ed3\u006e\u0067",'
    $jsonBuilder += '    managingUnit: "\u0054\u0068\u0075\u1ebf\u0020\u0063\u01a1\u0020\u0073\u1edf\u0020\u0031\u0033",'
    $jsonBuilder += '    reportDate: "' + $reportDate + '",'
    $jsonBuilder += '    currency: "VND",'
    $jsonBuilder += '    categories: {'
    $jsonBuilder += '      land: "\u0054\u0068\u0075\u0020\u0074\u0069\u1ec1\u006e\u0020\u0073\u1eed\u0020\u0064\u1ee5\u006e\u0067\u0020\u0111\u1ea5\u0074",'
    $jsonBuilder += '      enterpriseStateCentral: "\u0054\u0068\u1ebf\u0020\u0044\u004e\u004e\u004e\u0020\u0054\u0072\u0075\u006e\u0067\u0020\u01b0\u01a1\u006e\u0067",'
    $jsonBuilder += '      enterpriseStateLocal: "\u0054\u0068\u1ebf\u0020\u0044\u004e\u004e\u004e\u0020\u0110\u1ecb\u0061\u0020\u0070\u0068\u01b0\u01a1\u006e\u0067",'
    $jsonBuilder += '      enterpriseForeign: "\u0054\u0068\u1ebf\u0020\u0044\u004e\u0020\u0063\u00f3\u0020\u0076\u1ed1\u006e\u0020\u0110\u0054\u004e\u004e",'
    $jsonBuilder += '      enterpriseNonState: "\u0054\u0068\u1ebf\u0020\u004e\u0067\u006f\u00e0\u0069\u0020\u0071\u0075\u1ed1\u0063\u0020\u0064\u006f\u0061\u006e\u0068",'
    $jsonBuilder += '      pit: "\u0054\u0068\u1ebf\u0020\u0074\u0068\u0075\u0020\u006e\u0068\u1ead\u0070\u0020\u0063\u00e1\u0020\u006e\u0068\u00e2\u006e",'
    $jsonBuilder += '      registration: "\u004c\u1ec7\u0020\u0070\u0068\u00ed\u0020\u0074\u0072\u01b0\u1edb\u0063\u0020\u0062\u1ea1",'
    $jsonBuilder += '      landNonAgri: "\u0054\u0068\u1ebf\u0020\u0053\u0110\u0110\u0020\u0070\u0068\u0069\u0020\u004e\u004e",'
    $jsonBuilder += '      landRent: "\u0054\u0068\u0075\u0020\u0074\u0069\u1ec1\u006e\u0020\u0063\u0068\u006f\u0020\u0074\u0068\u0075\u00ea\u0020\u0111\u1ea5\u0074\u002e\u002e\u002e",'
    $jsonBuilder += '      minerals: "\u0054\u0068\u0075\u0020\u0043\u0051\u0020\u004b\u0054\u004b\u0053",'
    $jsonBuilder += '      otherBudget: "\u0054\u0068\u0075\u0020\u006b\u0068\u00e1\u0063\u0020\u006e\u0067\u00e2\u006e\u0020\u0073\u00e1\u0063\u0068",'
    $jsonBuilder += '      others: "\u0050\u0068\u00ed\u002c\u0020\u006c\u1ec7\u0020\u0070\u0068\u00ed\u0020\u0026\u0020\u0054\u0068\u0075\u0020\u006b\u0068\u00e1\u0063"'
    $jsonBuilder += '    }'
    $jsonBuilder += '  },'
    $jsonBuilder += '  communes: ['
    
    $communeJsons = @()
    foreach ($c in $communesData) {
        $cJson = "    {`n"
        $cJson += "      id: `"$($c.id)`",`n"
        $cJson += "      name: `"$($c.name)`",`n"
        
        # ProvinceTax
        $cJson += "      provinceTax: {`n"
        $cJson += "        target: $($c.provinceTax.target),`n"
        $cJson += "        today: $($c.provinceTax.today),`n"
        $cJson += "        ytd: $($c.provinceTax.ytd),`n"
        $cJson += "        lastYearYtd: $($c.provinceTax.lastYearYtd),`n"
        $cJson += "        details: {`n"
        $cJson += "          land: { target: $($c.provinceTax.details.land.target), ytd: $($c.provinceTax.details.land.ytd), lastYearYtd: $($c.provinceTax.details.land.lastYearYtd) },`n"
        $cJson += "          enterpriseStateCentral: { target: $($c.provinceTax.details.enterpriseStateCentral.target), ytd: $($c.provinceTax.details.enterpriseStateCentral.ytd), lastYearYtd: $($c.provinceTax.details.enterpriseStateCentral.lastYearYtd) },`n"
        $cJson += "          enterpriseStateLocal: { target: $($c.provinceTax.details.enterpriseStateLocal.target), ytd: $($c.provinceTax.details.enterpriseStateLocal.ytd), lastYearYtd: $($c.provinceTax.details.enterpriseStateLocal.lastYearYtd) },`n"
        $cJson += "          enterpriseForeign: { target: $($c.provinceTax.details.enterpriseForeign.target), ytd: $($c.provinceTax.details.enterpriseForeign.ytd), lastYearYtd: $($c.provinceTax.details.enterpriseForeign.lastYearYtd) },`n"
        $cJson += "          enterpriseNonState: { target: $($c.provinceTax.details.enterpriseNonState.target), ytd: $($c.provinceTax.details.enterpriseNonState.ytd), lastYearYtd: $($c.provinceTax.details.enterpriseNonState.lastYearYtd) },`n"
        $cJson += "          pit: { target: $($c.provinceTax.details.pit.target), ytd: $($c.provinceTax.details.pit.ytd), lastYearYtd: $($c.provinceTax.details.pit.lastYearYtd) },`n"
        $cJson += "          registration: { target: $($c.provinceTax.details.registration.target), ytd: $($c.provinceTax.details.registration.ytd), lastYearYtd: $($c.provinceTax.details.registration.lastYearYtd) },`n"
        $cJson += "          landNonAgri: { target: $($c.provinceTax.details.landNonAgri.target), ytd: $($c.provinceTax.details.landNonAgri.ytd), lastYearYtd: $($c.provinceTax.details.landNonAgri.lastYearYtd) },`n"
        $cJson += "          landRent: { target: $($c.provinceTax.details.landRent.target), ytd: $($c.provinceTax.details.landRent.ytd), lastYearYtd: $($c.provinceTax.details.landRent.lastYearYtd) },`n"
        $cJson += "          minerals: { target: $($c.provinceTax.details.minerals.target), ytd: $($c.provinceTax.details.minerals.ytd), lastYearYtd: $($c.provinceTax.details.minerals.lastYearYtd) },`n"
        $cJson += "          otherBudget: { target: $($c.provinceTax.details.otherBudget.target), ytd: $($c.provinceTax.details.otherBudget.ytd), lastYearYtd: $($c.provinceTax.details.otherBudget.lastYearYtd) },`n"
        $cJson += "          others: { target: $($c.provinceTax.details.others.target), ytd: $($c.provinceTax.details.others.ytd), lastYearYtd: $($c.provinceTax.details.others.lastYearYtd) }`n"
        $cJson += "        }`n"
        $cJson += "      },`n"
        
        # BaseTax
        $cJson += "      baseTax: {`n"
        $cJson += "        target: $($c.baseTax.target),`n"
        $cJson += "        today: $($c.baseTax.today),`n"
        $cJson += "        ytd: $($c.baseTax.ytd),`n"
        $cJson += "        lastYearYtd: $($c.baseTax.lastYearYtd),`n"
        $cJson += "        details: {`n"
        $cJson += "          land: { target: $($c.baseTax.details.land.target), ytd: $($c.baseTax.details.land.ytd), lastYearYtd: $($c.baseTax.details.land.lastYearYtd) },`n"
        $cJson += "          enterpriseStateCentral: { target: $($c.baseTax.details.enterpriseStateCentral.target), ytd: $($c.baseTax.details.enterpriseStateCentral.ytd), lastYearYtd: $($c.baseTax.details.enterpriseStateCentral.lastYearYtd) },`n"
        $cJson += "          enterpriseStateLocal: { target: $($c.baseTax.details.enterpriseStateLocal.target), ytd: $($c.baseTax.details.enterpriseStateLocal.ytd), lastYearYtd: $($c.baseTax.details.enterpriseStateLocal.lastYearYtd) },`n"
        $cJson += "          enterpriseForeign: { target: $($c.baseTax.details.enterpriseForeign.target), ytd: $($c.baseTax.details.enterpriseForeign.ytd), lastYearYtd: $($c.baseTax.details.enterpriseForeign.lastYearYtd) },`n"
        $cJson += "          enterpriseNonState: { target: $($c.baseTax.details.enterpriseNonState.target), ytd: $($c.baseTax.details.enterpriseNonState.ytd), lastYearYtd: $($c.baseTax.details.enterpriseNonState.lastYearYtd) },`n"
        $cJson += "          pit: { target: $($c.baseTax.details.pit.target), ytd: $($c.baseTax.details.pit.ytd), lastYearYtd: $($c.baseTax.details.pit.lastYearYtd) },`n"
        $cJson += "          registration: { target: $($c.baseTax.details.registration.target), ytd: $($c.baseTax.details.registration.ytd), lastYearYtd: $($c.baseTax.details.registration.lastYearYtd) },`n"
        $cJson += "          landNonAgri: { target: $($c.baseTax.details.landNonAgri.target), ytd: $($c.baseTax.details.landNonAgri.ytd), lastYearYtd: $($c.baseTax.details.landNonAgri.lastYearYtd) },`n"
        $cJson += "          landRent: { target: $($c.baseTax.details.landRent.target), ytd: $($c.baseTax.details.landRent.ytd), lastYearYtd: $($c.baseTax.details.landRent.lastYearYtd) },`n"
        $cJson += "          minerals: { target: $($c.baseTax.details.minerals.target), ytd: $($c.baseTax.details.minerals.ytd), lastYearYtd: $($c.baseTax.details.minerals.lastYearYtd) },`n"
        $cJson += "          otherBudget: { target: $($c.baseTax.details.otherBudget.target), ytd: $($c.baseTax.details.otherBudget.ytd), lastYearYtd: $($c.baseTax.details.otherBudget.lastYearYtd) },`n"
        $cJson += "          others: { target: $($c.baseTax.details.others.target), ytd: $($c.baseTax.details.others.ytd), lastYearYtd: $($c.baseTax.details.others.lastYearYtd) }`n"
        $cJson += "        }`n"
        $cJson += "      }`n"
        $cJson += "    }"
        $communeJsons += $cJson
    }
    
    $jsonBuilder += ($communeJsons -join ",`n")
    $jsonBuilder += '  ]'
    $jsonBuilder += '};'
    $jsonBuilder += ''
    $jsonBuilder += 'window.BUDGET_DATA = BUDGET_DATA;'
    
    [IO.File]::WriteAllText("d:\3Thue\data_v1_8.js", ($jsonBuilder -join "`n"), [System.Text.Encoding]::UTF8)
    Write-Host "Successfully generated data_v1_8.js with real targets and actuals!"
} catch {
    Write-Error $_.Exception.Message
} finally {
    if ($null -ne $excel) { 
        $excel.Quit() 
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    }
}