# Simple job creation test
$body = '{"original_source_code":"* Test\nPRINT \"Hello\"\nEND","job_name":"Test Job","target_language":"PYTHON"}'

Write-Host "Creating job..." -ForegroundColor Cyan
try {
    $job = Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/jobs/" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ Job ID: $($job.id), State: $($job.current_state)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
