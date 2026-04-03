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

The frontend follows **Screaming Architecture**: the folder structure screams the game domain. A reader should immediately understand this is a medieval strategy game, not a generic React app.

The UI is split into two rendering layers that sit on top of each other:

- **`src/game/`** — Pixi.js canvas occupies the full viewport (`position: absolute, inset: 0`). All game world rendering lives here, organized by domain.
- **`src/hud/`** — React overlay on top of the canvas (`position: absolute, inset: 0, pointerEvents: none`). All UI panels and menus live here, organized by domain. Interactive HUD children must set `pointerEvents: auto` explicitly.
- **`src/App.tsx`** — Mounts `<GameCanvas />` then `<Hud />` inside a full-viewport `.app` div.

Both `src/game/` and `src/hud/` are organized by game domain, not by technical role:

```
frontend/src/
├── game/                        # Pixi.js canvas layer
│   ├── GameCanvas.tsx           # Pixi Application bootstrap
│   ├── map/                     # World map tiles and grid rendering
│   ├── villages/                # Village sprites and selection
│   ├── units/                   # Unit movement and animations
│   └── battles/                 # Battle animations
├── hud/                         # React overlay layer
│   ├── Hud.tsx                  # HUD root, composes all panels
│   ├── villages/                # Village overview panel, construction queue
│   ├── buildings/               # Building detail panels
│   ├── units/                   # Unit training panel
│   ├── resources/               # Resource bar
│   └── battles/                 # Battle reports, attack panel
├── shared/                      # Cross-domain: types, API client, hooks
└── App.tsx
```

**Rules:**
- Name folders after game concepts (`villages/`, `buildings/`, `battles/`), never after technical roles (`components/`, `hooks/`, `utils/`).
- Each domain folder in `hud/` owns its React components and domain-specific hooks. Each domain folder in `game/` owns its Pixi display objects and scene logic.
- Cross-domain shared code (API client, global state, shared types) lives in `src/shared/`, not scattered across domain folders.
- The Pixi `Application` is initialized inside a `useEffect` in `GameCanvas.tsx` and destroyed on unmount.

### Backend

The backend follows **Screaming Architecture**: the folder structure screams the game domain, not the framework. A reader should immediately understand this is a medieval strategy game, not a generic NestJS app.

Each game domain lives in its own self-contained module under `src/`:

```
backend/src/
├── villages/
│   ├── villages.module.ts
│   ├── villages.controller.ts
│   ├── villages.service.ts
│   ├── village.entity.ts
│   └── villages.spec.ts
├── buildings/
│   ├── buildings.module.ts
│   ├── buildings.controller.ts
│   ├── buildings.service.ts
│   ├── building.entity.ts
│   └── buildings.spec.ts
├── units/
├── resources/
├── battles/
├── users/
└── app.module.ts
```

**Rules:**
- One folder per domain concept — name it after the game concept, not a technical role.
- Each domain module owns its entity, controller, service, and tests. No shared `entities/`, `controllers/`, or `services/` folders.
- Cross-domain dependencies are expressed through NestJS module imports, not direct file imports across domain boundaries.
- Infrastructure concerns (TypeORM config, env vars, auth guards) belong in `src/` root or a dedicated `common/` module, never inside a domain folder.

TypeORM is configured in `AppModule` via `TypeOrmModule.forRoot`. Entity files follow the `*.entity.ts` naming convention and are auto-discovered. `synchronize: true` is enabled in non-production environments (schema syncs automatically from entity definitions).

Database connection is configured via environment variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
