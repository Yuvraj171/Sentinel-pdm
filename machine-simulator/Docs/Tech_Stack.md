# Technical Stack Constraints

## Table of Contents

- [Introduction](#introduction)
- [Backend Architecture](#backend-architecture)
- [Database Layer](#database-layer)
- [Frontend Architecture](#frontend-architecture)
- [System Architecture](#system-architecture)
- [Performance Requirements](#performance-requirements)

## Introduction

This document outlines the strict technical constraints and technology stack chosen for the Induction Hardening Machine Simulator. These choices ensure the system meets the high-performance requirements for real-time data streaming and background processing.

## Backend Architecture

The backend serves as the core "Simulation Engine," handling physics calculations, state management, and API responses.

- **Language:** Python 3.11+ (Required for latest async features and typing support).
- **Framework:** FastAPI (Asynchronous).
  - Selected for its native support of asynchronous request handling, essential for the "1 Hz streaming" requirement.
  - Must utilize `BackgroundTasks` for non-blocking data generation.
- **ORM:** SQLAlchemy (Async).
  - Must be configured with an asynchronous driver (e.g., `asyncpg`) to prevent database I/O from blocking the simulation loop.

## Database Layer

The database acts as the "PLC Memory," storing high-frequency sensor telemetry and state changes.

- **Technology:** PostgreSQL 15+.
- **Optimization:**
  - Tables must be optimized for time-series writes.
  - B-Tree indexing on `timestamp_sim` is mandatory for fast dashboard polling.

## Frontend Architecture

The frontend provides the "Live Dashboard" for operators to visualize the simulation and control fault injection.

- **Framework:** React.
- **Build Tool:** Vite (Chosen for speed and modern ESM support).
- **State Management:** Must handle high-frequency (1 Hz) updates without UI freezing.

## System Architecture

The project follows a standard Monorepo structure to unify development of the simulator ecosystem.

- **Root Structure:**
  - `/backend` (Python/FastAPI application).
  - `/frontend` (React/Vite application).
  - Both reside in the root `induction-simulator/` directory.

## Performance Requirements

The simulator must meet specific throughput benchmarks to serve as a valid "Data Factory" for AI training.

- **Data Generation:** 50,000 rows of telemetry must be generated and committed to the database.
- **Time Constraint:** The full 50k generation cycle must complete in **< 10 seconds**.
- **Concurrency:** Large-scale data generation must occur in a background thread and must not block the API from responding to "Live Dashboard" requests.