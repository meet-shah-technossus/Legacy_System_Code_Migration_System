"""
Comprehensive test of state transitions.
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8001"

print("\n🎯 STATE TRANSITION TEST")
print("="*60)

# Create a job
job_data = {
    "original_source_code": "PRINT 'Test'\nEND",
    "job_name": "State Transition Test",
    "target_language": "PYTHON"
}

resp = requests.post(f"{BASE_URL}/api/jobs/", json=job_data)
job = resp.json()
job_id = job['id']

print(f"\n✅ Job {job_id} created: {job['current_state']}")

# Test valid transitions
transitions = [
    ("YAML_GENERATED", True),
    ("UNDER_REVIEW", True),
    ("APPROVED", True),
    ("CODE_GENERATED", True),
    ("COMPLETED", True),
]

for new_state, should_succeed in transitions:
    try:
        resp = requests.post(
            f"{BASE_URL}/api/jobs/{job_id}/transition",
            json={"new_state": new_state}
        )
        
        if resp.status_code == 200:
            result = resp.json()
            print(f"✅ {result['current_state']}")
        else:
            error = resp.json()
            print(f"❌ Failed: {error['detail']}")
    except Exception as e:
        print(f"❌ Error: {e}")

print(f"\n{'='*60}")
print("✨ Test complete!\n")
