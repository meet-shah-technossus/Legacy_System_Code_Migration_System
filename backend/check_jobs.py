import sqlite3

conn = sqlite3.connect('migration.db')
c = conn.cursor()

# Get jobs
c.execute('SELECT id, job_name, current_state, target_language, created_at FROM migration_jobs')
jobs = c.fetchall()

print("\n📊 Jobs in Database:")
print("=" * 70)
if jobs:
    for job in jobs:
        print(f"ID: {job[0]} | Name: {job[1]} | State: {job[2]} | Lang: {job[3]}")
else:
    print("No jobs found")
    
print(f"\nTotal jobs: {len(jobs)}")

# Get audit logs
c.execute('SELECT id, action, description, timestamp FROM audit_logs ORDER BY timestamp')
logs = c.fetchall()

print("\n📝 Audit Logs:")
print("=" * 70)
if logs:
    for log in logs[:5]:  # First 5
        print(f"{log[3]} | {log[1]} | {log[2]}")
    if len(logs) > 5:
        print(f"... and {len(logs) - 5} more")
else:
    print("No audit logs")

print(f"\nTotal logs: {len(logs)}\n")

conn.close()
