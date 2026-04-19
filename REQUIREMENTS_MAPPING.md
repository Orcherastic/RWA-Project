# Requirements Mapping

This document maps each exam requirement to concrete implementation points in this project.

## Required technologies

1. RxJS
- `client/src/app/whiteboard/whiteboard.component.ts`
  - cursor stream: `fromEvent`, `map`, `filter`, `distinctUntilChanged`, `throttleTime`, `takeUntil`
  - autosave stream: `merge`, `debounceTime`, `switchMap`, `retry`, `catchError`
  - resync stream: `timer`, `switchMap`, `take`, `takeUntil`
- `client/src/app/board/board.component.ts`
  - `merge`, `zip`, `take`, `takeUntil`, `map`
- `client/src/app/state/boards/boards.effects.ts`
  - `switchMap`, `mergeMap`, `map`, `catchError`

2. Angular
- Components and services:
  - `client/src/app/board/board.component.ts`
  - `client/src/app/whiteboard/whiteboard.component.ts`
  - `client/src/app/services/*.ts`
- Input/output parameters:
  - `client/src/app/components/board-item/board-item.component.ts`
- Dependency injection:
  - constructors across components/services/effects (`inject` + constructor DI)
- Routing:
  - `client/src/app/app.routes.ts`
- NgRx store/entities/effects:
  - `client/src/app/state/boards/*`
  - `client/src/app/state/whiteboard-ui/*`
  - `client/src/app/app.config.ts`

3. NestJS + DB + Docker
- Nest modules/controllers/services:
  - `server/src/auth/*`
  - `server/src/board/*`
  - `server/src/user/*`
- DB connection:
  - `server/src/app.module.ts`
  - `server/src/database/data-source.ts`
- Dockerized database:
  - `docker-compose.yml` (Postgres 15)
- Migrations (no runtime sync):
  - `server/src/migrations/*`
  - `synchronize: false` in app config

## RxJS-specific requirement items

1. Functional/array operations
- `map`, `filter`, `forEach`, `reduce` used in client/server logic
- `reduce` example:
  - `client/src/app/board/board.component.ts`

2. Async programming (`fetch API`, `Promise`)
- `client/src/app/services/board.service.ts`
  - `fetchServerStatus(): Promise<...>` using `fetch`

3. Operators (`switchMap`, `take`, `takeUntil`, `zip`, `merge` + combinational)
- `switchMap`: `boards.effects.ts`, `whiteboard.component.ts`
- `take`, `takeUntil`, `zip`, `merge`: `board.component.ts`, `whiteboard.component.ts`
- combinational usage:
  - `combineLatest` in `board.component.ts`

## Angular-specific requirement items

1. Components/services: present across `client/src/app/**`
2. In/out parameters:
- `@Input`/`@Output` in `board-item.component.ts`
3. Dependency injection:
- all major components/services/effects
4. NgRx store + entities:
- `boards.reducer.ts` uses `createEntityAdapter`
5. NgRx effects:
- `boards.effects.ts`, `whiteboard-ui.effects.ts`
6. Routing:
- guarded routes in `app.routes.ts`

## NestJS/DB requirement items

1. DB connection:
- TypeORM + Postgres in `app.module.ts`
2. DB with Docker:
- `docker-compose.yml`
3. CRUD operations:
- Users CRUD: `server/src/user/user.controller.ts` + service
- Boards CRUD + content/share/leave: `server/src/board/board.controller.ts` + service
- Relation entity CRUD coverage:
  - members list/remove
  - invites list/cancel/accept/decline
4. At least 3 entities with relations:
- `User`, `Board`, `BoardMember`, `BoardInvite`
5. Passport.js authentication:
- local + JWT strategies and guards in `server/src/auth/*`
- refresh/logout flow in `auth.controller.ts` + `auth.service.ts`

## Git/incremental work

Project has incremental commit history with feature-by-feature progress on `main`.
