# Legacy Code Migration Backend

Backend service for migrating Pick Basic legacy code to modern programming languages using LLM-powered transformation.

## 🏗️ Architecture

Two-stage transformation pipeline:
1. **Pick Basic → YAML** (LLM Agent 1 with validation)
2. **YAML → Modern Code** (LLM Agent 2 with mapping rules)

Human-in-the-loop review between stages ensures quality and control.

## 📋 Prerequisites

- Python 3.11 or higher
- Google Gemini API key (for LLM functionality)

## 🚀 Quick Start

### 1. Clone and Navigate

```bash
cd backend
```

### 2. Create Virtual Environment

```bash
python -m venv venv
```

### 3. Activate Virtual Environment

**Windows:**
```bash
venv\Scripts\activate
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your Google Gemini API key:
```
GEMINI_API_KEY=your_actual_api_key_here
```

### 6. Run the Server

```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 7. Access Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## 📁 Project Structure

```
backend/
├── app/
│   ├── api/              # API route handlers
│   ├── audit/            # Audit and versioning
│   ├── core/             # Configuration and database
│   ├── llm/              # LLM agents (YAML & Code generators)
│   ├── mapping/          # Pick Basic → Modern language mapping rules
│   ├── models/           # SQLAlchemy database models
│   ├── schemas/          # Pydantic validation schemas
│   └── services/         # Business logic layer
├── tests/                # Test suite
├── main.py               # Application entry point
├── requirements.txt      # Python dependencies
└── .env.example          # Environment configuration template
```

## 🔄 Migration Workflow

```
1. Create Migration Job          → CREATED
2. Generate YAML (Agent 1)       → YAML_GENERATED → UNDER_REVIEW
3. Review Decision:
   - Reject → Regenerate         → REGENERATE_REQUESTED → (back to step 2)
   - Approve                     → APPROVED
   - Approve with Comments       → APPROVED_WITH_COMMENTS
4. Generate Code (Agent 2)       → CODE_GENERATED
5. Complete                      → COMPLETED
```

## 🗄️ Database

- **POC**: SQLite (file-based, zero setup)
- **Production**: PostgreSQL (recommended)

Database file: `migration.db` (created automatically on first run)

## 🧪 Testing

```bash
pytest
```

Run with coverage:
```bash
pytest --cov=app tests/
```

## 🔧 Development

### Adding New API Endpoints

1. Create route handler in `app/api/`
2. Include router in `main.py`
3. Add corresponding service logic in `app/services/`

### Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migration
alembic upgrade head
```

## 📊 API Endpoints

### Health & Status
- `GET /` - Root health check
- `GET /health` - Detailed health status

### Jobs (Coming in Phase 3)
- `POST /api/jobs` - Create migration job
- `GET /api/jobs/{id}` - Get job details
- `GET /api/jobs` - List all jobs

### YAML (Coming in Phase 4)
- `POST /api/jobs/{id}/generate-yaml` - Generate YAML from Pick Basic
- `GET /api/jobs/{id}/yaml/versions` - Get YAML version history

### Review (Coming in Phase 5)
- `POST /api/jobs/{id}/review` - Submit review decision
- `POST /api/jobs/{id}/yaml/regenerate` - Request regeneration

### Code (Coming in Phase 6)
- `POST /api/jobs/{id}/generate-code` - Generate modern code
- `GET /api/jobs/{id}/code` - Get generated code

## 🔑 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | Required |
| `GEMINI_MODEL` | Gemini model name | gemini-2.0-flash-exp |
| `DATABASE_URL` | Database connection string | sqlite:///./migration.db |
| `DEBUG` | Enable debug mode | True |
| `PORT` | Server port | 8000 |

## 📝 Current Status

**Phase 1: Foundation & Setup** ✅ COMPLETE
- Project structure created
- FastAPI application bootstrapped
- Database configuration ready
- Health check endpoints working

**Phase 2: Core Data Models & Database Schema** ✅ COMPLETE
- 6 database tables created with relationships
- Complete Pydantic validation schemas
- Strict YAML contract defined
- State machine enums implemented

**Database Schema:**
- `migration_jobs` - Core job tracking (13 columns)
- `yaml_versions` - YAML version history (17 columns)
- `reviews` - Review decisions (7 columns)  
- `review_comments` - Section-specific comments (8 columns)
- `generated_codes` - Generated code storage (15 columns)
- `audit_logs` - Complete audit trail (9 columns)

**Phase 3: Job Manager & State Machine** ✅ COMPLETE
- Job CRUD operations fully functional
- State machine with validated transitions
- Complete audit logging system
- 10+ job management endpoints

**Phase 4: YAML Generation Engine (LLM Agent 1)** ✅ COMPLETE
- Gemini LLM client integration
- YAML generation with strict schema validation
- Auto-retry logic (up to 3 attempts)
- YAML version management & lineage tracking
- 8 YAML-specific API endpoints

**API Endpoints Available:**

*Job Management:*
- `POST /api/jobs/` - Create new job
- `GET /api/jobs/` - List jobs with filters
- `GET /api/jobs/{id}` - Get job details
- `PATCH /api/jobs/{id}` - Update job metadata
- `POST /api/jobs/{id}/transition` - Transition state
- `DELETE /api/jobs/{id}` - Delete job
- `GET /api/jobs/statistics` - Get system statistics

*YAML Generation:*
- `POST /api/jobs/{id}/yaml/generate` - Generate YAML from source code
- `GET /api/jobs/{id}/yaml/versions` - List all YAML versions
- `GET /api/jobs/{id}/yaml/versions/{version}` - Get specific version
- `GET /api/jobs/{id}/yaml/latest` - Get latest YAML version
- `POST /api/jobs/{id}/yaml/versions/{version}/approve` - Approve YAML
- `GET /api/jobs/{id}/yaml/versions/{version}/lineage` - Get version history
- `GET /api/jobs/{id}/yaml/statistics` - YAML version statistics

**Next**: Phase 5 - Review Layer & Human-in-the-Loop

## 🤝 Contributing

This is a POC project. Additional phases will be implemented incrementally.

## 📄 License

Internal use only.
