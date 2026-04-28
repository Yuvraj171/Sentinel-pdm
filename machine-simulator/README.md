# Induction Hardening Machine Simulator

A high-fidelity "Data Factory" simulating an Induction Hardening machine to generate continuous, physics-based telemetry streams for Predictive Maintenance AI training.

## Project Structure

- **backend/**: Python/FastAPI simulation engine.
- **frontend/**: React/Vite live dashboard (To be initialized).

## Getting Started

### Prerequisites

- **Python**: 3.11+
- **Node.js**: 18+ (Recommended)
- **PostgreSQL**: 15+

### Running the Simulator (Development Mode)

Since the project uses a Monorepo structure, you will need to run the backend and frontend in separate terminals.

#### 1. Backend (Physics Engine)

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python -m venv venv
    # Windows:
    .\venv\Scripts\activate
    # Linux/Mac:
    source venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run the development server:
    ```bash
    uvicorn main:app --reload
    ```
    The backend API will be available at `http://localhost:8000/`. You can verify it by visiting `http://localhost:8000/health`.

#### 2. Frontend (Live Dashboard)

*Note: The frontend application is currently being initialized. Once set up, the following steps will apply:*

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the dev server:
    ```bash
    npm run dev
    ```
    The dashboard will be available at `http://localhost:5173/`.

## Building for Production

To build the simulator for a production-like environment:

1.  **Frontend**: Run `npm run build` in the `frontend/` directory to generate static assets in `frontend/dist/`.
2.  **Backend**: The backend can serve these static files or run independently behind a reverse proxy (e.g., Nginx).

## How to Inspect the Data (Database)

Since this project uses **PostgreSQL** (a server-based database), you cannot simply open a file to see the data. You need a "Database Client" tool.

### Recommended Tools
1.  **DBeaver** (Free, Universal Standalone App) - Highly recommended.
2.  **pgAdmin 4** (Official Postgres Tool).
3.  **VS Code Extensions** (e.g., "SQLTools" or "Database Client").

### Connection Details
To connect your tool to the database, use these settings (matching your `.env` file):

- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `induction_hardening_db`
- **User**: `user` (or what you set in .env)
- **Password**: `password` (or what you set in .env)

Once connected, you can browse `Tables` -> `telemetry` to see the live data rows.