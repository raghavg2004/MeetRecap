Param(
    [string]$RemoteUrl = "https://github.com/raghavg2004/MeetRecap.git",
    [string]$Branch = "main"
)

# Initialize repo if needed
if (-not (Test-Path -Path ".git")) {
    Write-Host "No .git found — initializing repository..."
    git init
} else {
    Write-Host ".git detected — using existing repository."
}

# Stage all files
git add -A

# Commit if there are changes
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "No changes to commit."
} else {
    git commit -m "Initial commit from local workspace"
}

# Configure remote
$hasOrigin = git remote | Select-String -Pattern "origin" -Quiet
if (-not $hasOrigin) {
    git remote add origin $RemoteUrl
} else {
    git remote set-url origin $RemoteUrl
}

# Ensure branch name
git branch -M $Branch

# Push
Write-Host "Pushing to $RemoteUrl on branch $Branch..."
try {
    git push -u origin $Branch
    Write-Host "Push completed."
} catch {
    Write-Host "Push failed. You may need to authenticate (use SSH or a Personal Access Token)."
}
