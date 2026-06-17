# PowerShell Static HTTP Server + POST /save-data endpoint
$port = 8080
$projectRoot = "d:\3Thue"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")

function Write-Response {
    param($response, $bytes, $contentType, $statusCode = 200)
    $response.StatusCode = $statusCode
    $response.ContentType = $contentType
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    try { $response.OutputStream.Close() } catch {}
}

try {
    $listener.Start()

    Write-Output "HTTP server started at http://localhost:$port/"
    Write-Output "POST /save-data => writes to $projectRoot\data_v1_8.js + backup in data/"
    Write-Output "Press Ctrl+C to stop."

    while ($listener.IsListening) {
        $context  = $null
        $request  = $null
        $response = $null
        try {
            $context  = $listener.GetContext()
            $request  = $context.Request
            $response = $context.Response

            # CORS
            $response.Headers.Add("Access-Control-Allow-Origin",  "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

            $method  = $request.HttpMethod
            $urlPath = $request.Url.LocalPath

            # ---- OPTIONS preflight ----
            if ($method -eq "OPTIONS") {
                $response.StatusCode = 204
                try { $response.OutputStream.Close() } catch {}
            }
            # ---- POST /save-data ----
            elseif ($method -eq "POST" -and $urlPath -eq "/save-data") {
                $bodyReader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body       = $bodyReader.ReadToEnd()
                $bodyReader.Close()

                # Ghi file data_v1_8.js chinh
                $dataFile = Join-Path $projectRoot "data_v1_8.js"
                [System.IO.File]::WriteAllText($dataFile, $body, [System.Text.Encoding]::UTF8)

                # Tao backup trong thu muc data/
                $dataDir = Join-Path $projectRoot "data"
                if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
                $ts         = Get-Date -Format "yyyyMMdd_HHmmss"
                $backupFile = Join-Path $dataDir "data_v1_8_$ts.js"
                [System.IO.File]::WriteAllText($backupFile, $body, [System.Text.Encoding]::UTF8)

                $json  = '{"ok":true,"backup":"data/data_v1_8_' + $ts + '.js"}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                Write-Response $response $bytes "application/json; charset=utf-8"
                Write-Output "[$(Get-Date -Format 'HH:mm:ss')] SAVED data_v1_8.js | backup: data_v1_8_$ts.js"
            }
            # ---- GET static files ----
            else {
                if ($urlPath -eq "/") { $urlPath = "/index.html" }
                $cleanPath = $urlPath.Replace("/", "\").TrimStart('\')
                $filePath  = Join-Path $projectRoot $cleanPath

                if (Test-Path $filePath -PathType Leaf) {
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $ct = switch -Wildcard ($filePath) {
                        "*.html" { "text/html; charset=utf-8" }
                        "*.css"  { "text/css; charset=utf-8" }
                        "*.js"   { "application/javascript; charset=utf-8" }
                        "*.json" { "application/json; charset=utf-8" }
                        "*.png"  { "image/png" }
                        "*.jpg"  { "image/jpeg" }
                        "*.jpeg" { "image/jpeg" }
                        default  { "application/octet-stream" }
                    }
                    $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
                    $response.Headers.Add("Pragma", "no-cache")
                    $response.Headers.Add("Expires", "0")
                    Write-Response $response $bytes $ct
                } else {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
                    Write-Response $response $errBytes "text/plain; charset=utf-8" 404
                }
            }
        } catch {
            Write-Warning "Request error: $_"
            if ($null -ne $response) { try { $response.OutputStream.Close() } catch {} }
        }
    }
} catch {
    Write-Error $_
} finally {
    if ($null -ne $listener -and $listener.IsListening) { $listener.Close() }
}
