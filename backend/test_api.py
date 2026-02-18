"""Simple test of job API endpoints"""
import requests
import json

BASE_URL = "http://127.0.0.1:8001"

print("\n🧪 Testing Job API Endpoints\n" + "="*50)

# Test 1: Create a job
print("\n1. Creating migration job...")
job_data = {
    "original_source_code": "* Simple Pick Basic\nPRINT 'Hello World'\nEND",
    "job_name": "Hello World Migration",
    "description": "Test migration",
    "source_filename": "HELLO.BP",
    "target_language": "PYTHON"
}

response = requests.post(f"{BASE_URL}/api/jobs/", json=job_data)
if response.status_code == 201:
    job = response.json()
    print(f"   ✅ Job created successfully!")
    print(f"   ID: {job['id']}")
    print(f"   State: {job['current_state']}")
    print(f"   Target: {job['target_language']}")
    job_id = job['id']
else:
    print(f"   ❌ Failed: {response.status_code}")
    print(f"   {response.text}")
    exit(1)

# Test 2: Get job details
print(f"\n2. Fetching job {job_id} details...")
response = requests.get(f"{BASE_URL}/api/jobs/{job_id}")
if response.status_code == 200:
    job = response.json()
    print(f"   ✅ Job fetched!")
    print(f"   Name: {job['job_name']}")
    print(f"   State: {job['current_state']}")
else:
    print(f"   ❌ Failed: {response.status_code}")

# Test 3: List all jobs
print("\n3. Listing all jobs...")
response = requests.get(f"{BASE_URL}/api/jobs/")
if response.status_code == 200:
    jobs = response.json()
    print(f"   ✅ Found {len(jobs)} job(s)")
    for j in jobs:
        print(f"      - Job {j['id']}: {j['job_name']} ({j['current_state']})")
else:
    print(f"   ❌ Failed: {response.status_code}")

# Test 4: Get statistics
print("\n4. Getting statistics...")
response = requests.get(f"{BASE_URL}/api/jobs/statistics")
if response.status_code == 200:
    stats = response.json()
    print(f"   ✅ Total jobs: {stats['total_jobs']}")
    print(f"   By state:")
    for state, count in stats['by_state'].items():
        if count > 0:
            print(f"      {state}: {count}")
else:
    print(f"   ❌ Failed: {response.status_code}")

# Test 5: Get allowed transitions
print(f"\n5. Checking allowed transitions for job {job_id}...")
response = requests.get(f"{BASE_URL}/api/jobs/{job_id}/allowed-transitions")
if response.status_code == 200:
    trans = response.json()
    print(f"   ✅ Current state: {trans['current_state']}")
    print(f"   Allowed transitions: {', '.join(trans['allowed_transitions'])}")
    print(f"   Is terminal: {trans['is_terminal']}")
else:
    print(f"   ❌ Failed: {response.status_code}")

print("\n" + "="*50)
print("✨ All tests completed!\n")
