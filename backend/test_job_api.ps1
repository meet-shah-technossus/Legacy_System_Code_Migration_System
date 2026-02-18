# Test job creation
$pickCode = Get-Content -Path "sample_pick_code.txt" -Raw

$body = @{
    original_source_code = $pickCode
    job_name = "Invoice Report Migration"
    description = "Test migration of invoice reporting program"
    source_filename = "INVOICE.REPORT"
    target_language = "PYTHON"
} | ConvertTo-Json

Write-Host "Creating migration job..." -ForegroundColor Green
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/jobs/" -Method Post -Body $body -ContentType "application/json"

Write-Host "`n✅ Job created successfully!" -ForegroundColor Green
Write-Host "Job ID: $($response.id)" -ForegroundColor Cyan
Write-Host "State: $($response.current_state)" -ForegroundColor Cyan
Write-Host "Created: $($response.created_at)" -ForegroundColor Cyan

# Save job ID for next tests
$jobId = $response.id
Write-Host "`n📝 Job ID saved: $jobId" -ForegroundColor Yellow

# Test getting job details
Write-Host "`n🔍 Fetching job details..." -ForegroundColor Green
$jobDetails = Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/jobs/$jobId"
Write-Host "Job Name: $($jobDetails.job_name)" -ForegroundColor Cyan
Write-Host "Target Language: $($jobDetails.target_language)" -ForegroundColor Cyan
Write-Host "Current State: $($jobDetails.current_state)" -ForegroundColor Cyan

# Test listing all jobs
Write-Host "`n📋 Listing all jobs..." -ForegroundColor Green
$allJobs = Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/jobs/"
Write-Host "Total jobs: $($allJobs.Count)" -ForegroundColor Cyan

# Test getting statistics
Write-Host "`n📊 Getting statistics..." -ForegroundColor Green
$stats = Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/jobs/statistics"
Write-Host "Total: $($stats.total_jobs)" -ForegroundColor Cyan
Write-Host "By State:" -ForegroundColor Cyan
$stats.by_state.PSObject.Properties | ForEach-Object {
    if ($_.Value -gt 0) {
        Write-Host "  $($_.Name): $($_.Value)" -ForegroundColor White
    }
}

Write-Host "`n✨ All tests passed!" -ForegroundColor Green
