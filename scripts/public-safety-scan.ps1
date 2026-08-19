$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$excludedSegments = @('node_modules', 'bin', 'obj', 'dist', 'dist-production', 'dist-diagnostic', '.git', '.idea', '.codex', '.agents', 'Makets')
$allowedHosts = @(
    'localhost',
    'teamcity.example.test',
    'one.example.test',
    'two.example.test',
    'backend.example.invalid',
    'json.schemastore.org',
    'www.w3.org',
    'www.jetbrains.com',
    'jetbrains.com',
    't.me',
    'api.nuget.org',
    'registry.npmjs.org',
    'eslint.org',
    'opencollective.com',
    'tidelift.com',
    'github.com',
    'docs.github.com'
)
$forbiddenExtensions = @('.apk', '.ipa', '.nupkg', '.har', '.netlog', '.db', '.sqlite', '.sqlite3')
$secretAssignmentPattern = '(?im)(password|passwd|secret|api[_-]?key|access[_-]?token|bearer)\s*[:=]\s*["''][^"'']{8,}'
$urlPattern = 'https?://([A-Za-z0-9.-]+)'
$violations = [System.Collections.Generic.List[string]]::new()
$checkedFileCount = 0

function Test-IsExcludedPath([string]$relativePath) {
    $segments = $relativePath -split '[\\/]'
    return $null -ne ($segments | Where-Object { $excludedSegments -contains $_ } | Select-Object -First 1)
}

$files = @(Get-ChildItem -LiteralPath $projectRoot -Recurse -File)

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($projectRoot.Length).TrimStart([char[]]'\/')
    if (Test-IsExcludedPath $relativePath) {
        continue
    }
    $checkedFileCount += 1
    if ($forbiddenExtensions -contains $file.Extension.ToLowerInvariant()) {
        $violations.Add("forbidden artifact type: $relativePath")
        continue
    }

    $content = [IO.File]::ReadAllText($file.FullName)
    if ([regex]::IsMatch($content, $secretAssignmentPattern)) {
        $violations.Add("possible secret assignment: $relativePath")
    }
    foreach ($match in [regex]::Matches($content, $urlPattern)) {
        $hostName = $match.Groups[1].Value.ToLowerInvariant()
        $isSyntheticHost = $hostName.EndsWith('.example.test') -or $hostName.EndsWith('.example.invalid')
        if (-not $isSyntheticHost -and $allowedHosts -notcontains $hostName) {
            $violations.Add("unapproved URL host '$hostName': $relativePath")
        }
    }
}

if ($violations.Count -gt 0) {
    $violations | Sort-Object -Unique | ForEach-Object { Write-Output "ERROR: $_" }
    exit 1
}

Write-Output "Public safety scan passed: $checkedFileCount files checked."
