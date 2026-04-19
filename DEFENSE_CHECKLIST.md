# Defense Checklist

Use this as a short pre-defense runbook and demo script.

## Pre-demo smoke checks

1. Start services
- `docker compose up -d`
- backend: `cd server && npm run start:dev`
- frontend: `cd client && npm start`

2. Verify DB migration status
- `cd server`
- `npm run migration:show`
- confirm all migrations are marked `[X]`

3. Verify auth environment
- `JWT_SECRET` is set
- optional: `JWT_REFRESH_SECRET` is set

4. Use two users for collaboration demo
- User A (owner)
- User B (invitee/member)

## Suggested 8-12 minute demo flow

1. Login/Register
- register/login User A
- open boards page

2. Board CRUD + relation CRUD
- create board
- rename board
- share board (invite User B)
- show member/invite relation behavior (accept/decline/cancel/remove)

3. Whiteboard realtime
- open same board in two sessions
- draw shapes/brush/eraser/fill
- demonstrate layers (add, rename, lock, visibility, reorder)
- show undo/redo and clear flow

4. RxJS intent highlights
- cursor updates are throttled/deduped
- autosave is debounced
- reconnect triggers resync pipeline

5. Auth hardening highlights
- short access token lifecycle
- refresh token rotation
- logout revokes refresh token server-side
- expired access token triggers interceptor refresh + retry

6. Migration maturity highlight
- explain `synchronize: false`
- show migration scripts and applied status

## Quick fallback plan (if live issue happens)

1. Refresh frontend
2. Re-login to refresh session
3. Re-open board and continue from board list
4. If needed, restart backend and retry from login

## “Where in code” references for examiner

1. Requirements mapping: `REQUIREMENTS_MAPPING.md`
2. Auth flow: `server/src/auth/*`, `client/src/app/interceptors/auth.interceptor.ts`
3. NgRx + RxJS: `client/src/app/state/*`, `client/src/app/whiteboard/whiteboard.component.ts`
4. Migrations: `server/src/migrations/*`
