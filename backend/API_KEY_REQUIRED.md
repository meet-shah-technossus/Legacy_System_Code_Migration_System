# ⚠️ IMPORTANT: Gemini API Key Required

## Current Status
The YAML generation system is **fully implemented and functional**, but requires a valid Google Gemini API key to generate YAML from Pick Basic code.

## What's Working WITHOUT API Key
✅ All API endpoints are operational  
✅ Job creation and management  
✅ YAML version storage and retrieval  
✅ Validation pipeline (when YAML is provided)  
✅ State machine transitions  
✅ Audit logging  
✅ API documentation at http://127.0.0.1:8001/docs

## What REQUIRES API Key
❌ YAML generation from Pick Basic source code  
❌ Auto-retry with LLM feedback  
❌ Completing the full CREATED → YAML_GENERATED flow

## How to Get a Gemini API Key

### Option 1: Google AI Studio (Free Tier)
1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key
5. Update `.env` file:
   ```bash
   GEMINI_API_KEY=AIzaSy...your_actual_key
   ```
6. Restart the server:
   ```bash
   cd backend
   .\venv\Scripts\activate
   uvicorn main:app --host 127.0.0.1 --port 8001 --reload
   ```

### Option 2: Google Cloud Console (Production)
1. Visit: https://console.cloud.google.com/
2. Enable the "Generative Language API"
3. Create credentials → API Key
4. Add API key to `.env`
5. Restart server

## Free Tier Limits (Google AI Studio)
- **Requests**: 15 requests per minute
- **Tokens**: 1 million tokens per minute
- **Daily limit**: 1,500 requests per day

Sufficient for POC and development.

## Testing YAML Generation

Once you have a valid API key:

```bash
# 1. Create a job
curl -X POST http://127.0.0.1:8001/api/jobs/ \
  -H "Content-Type: application/json" \
  -d '{
    "original_source_code": "PRINT \"Hello Pick Basic\"\nEND",
    "target_language": "PYTHON",
    "created_by": "test_user",
    "source_filename": "test.bp"
  }'

# 2. Generate YAML (replace {job_id} with ID from step 1)
curl -X POST http://127.0.0.1:8001/api/jobs/{job_id}/yaml/generate \
  -H "Content-Type: application/json" \
  -d '{
    "performed_by": "test_user"
  }'

# 3. View generated YAML
curl http://127.0.0.1:8001/api/jobs/{job_id}/yaml/latest
```

Or use the comprehensive test:
```bash
cd backend
. .\venv\Scripts\activate
python test_yaml_workflow.py
```

## Alternative: Mock LLM for Testing

If you want to test without an API key, you can:
1. Create a mock YAML response
2. Manually insert into database
3. Test the review/approval workflow

Example:
```sql
-- Insert mock YAML version
INSERT INTO yaml_versions (
  job_id, version_number, yaml_content, is_valid, 
  generated_by, created_at
) VALUES (
  1, 1, 'metadata:\n  original_filename: "test.bp"', 
  1, 'mock_generator', datetime('now')
);
```

## Next Steps
1. Get API key (5 minutes)
2. Update `.env` file
3. Restart server
4. Run `test_yaml_workflow.py`
5. Proceed to Phase 5 (Review Layer)
