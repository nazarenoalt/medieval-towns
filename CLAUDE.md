# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Medieval Towns is a browser-based strategy game inspired by Tribal Wars. Players manage medieval villages, gather resources, construct buildings, train military units, and attack other players on a shared map.

## Monorepo Structure

```
/
├── frontend/   React + Vite + TypeScript + Pixi.js
├── backend/    NestJS + TypeScript + TypeORM + PostgreSQL
└── docker-compose.yml
```

## Commands

### Root (run from repo root)

```bash
npm run dev:frontend       # Start frontend dev server
npm run dev:backend        # Start backend in watch mode
npm run build              # Build both packages
npm run lint               # Lint both packages
npm run test               # Run all tests
```

### Frontend

```bash
cd frontend
npm run dev                # Vite dev server (http://localhost:5173)
npm run build              # Production build
npm run lint               # ESLint
npm run preview            # Preview production build
```

### Backend

```bash
cd backend
npm run start:dev          # NestJS watch mode (http://localhost:3000)
npm run build              # Compile TypeScript
npm run lint               # ESLint
npm run test               # Unit tests (Jest)
npm run test:e2e           # End-to-end tests
npm run test -- --testPathPattern=foo  # Run a single test file
```

### Database

```bash
docker compose up -d       # Start PostgreSQL (localhost:5432)
docker compose down        # Stop PostgreSQL
```

Copy `backend/.env.example` to `backend/.env` before running the backend.

## Architecture

### Frontend

The UI is split into two rendering layers that sit on top of each other:

- **`src/game/`** — Pixi.js canvas occupies the full viewport (`position: absolute, inset: 0`). All game world rendering (map tiles, villages, units, animations) lives here.
- **`src/hud/`** — React overlay on top of the canvas (`position: absolute, inset: 0, pointerEvents: none`). Contains all UI panels, menus, resource bars, etc. Interactive HUD children must set `pointerEvents: auto` explicitly.
- **`src/App.tsx`** — Mounts `<GameCanvas />` then `<Hud />` inside a full-viewport `.app` div.

The Pixi `Application` is initialized inside a `useEffect` in `GameCanvas.tsx` and destroyed on unmount.

### Backend

Standard NestJS feature module layout. Each game domain (e.g. villages, users, buildings, units, battles) should be its own module under `src/`.

TypeORM is configured in `AppModule` via `TypeOrmModule.forRoot`. Entity files follow the `*.entity.ts` naming convention and are auto-discovered. `synchronize: true` is enabled in non-production environments (schema syncs automatically from entity definitions).

Database connection is configured via environment variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
