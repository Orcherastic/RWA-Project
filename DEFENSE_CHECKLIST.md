# Defense Checklist

## Step-to-Code Map (Files + Lines)

Use this for quick "show me in code" jumps during presentation.

### A) Pre-demo smoke checks

1. Start services
- `docker compose up -d`:
    - Docker DB service: 
        `docker-compose.yml:2`, 
        `docker-compose.yml:7`, 
        `docker-compose.yml:9`
- backend: 
    `cd server && npm run start:dev`
    - Backend dev start script: 
        `server/package.json:17`
- frontend: 
    `cd client && npm start`
    - Frontend start script: 
        `client/package.json:6`

2. Verify DB migration status
- `cd server`, `npm run migration:show`, confirm all migrations are marked `[X]`
- Migration scripts (`show/run/revert`): 
    `server/package.json:11`, 
    `server/package.json:12`, 
    `server/package.json:13`
- TypeORM CLI wiring: 
    `server/package.json:10`
- Migration config + `synchronize: false`: 
    `server/src/database/data-source.ts:17`, 
    `server/src/database/data-source.ts:18`

3. Verify auth environment
- `JWT_SECRET` is set
- optional: `JWT_REFRESH_SECRET` is set
- Runtime env key present: 
    `server/.env:6`
- `JWT_SECRET` required at startup: 
    `server/src/auth/auth.module.ts:19`, 
    `server/src/auth/auth.module.ts:21`
- Refresh secret resolution (`JWT_REFRESH_SECRET` fallback to `JWT_SECRET`): 
    `server/src/auth/auth.service.ts:25`, 
    `server/src/auth/auth.service.ts:26`, 
    `server/src/auth/auth.service.ts:28`
- JWT strategy hard-fail if missing secret: 
    `server/src/auth/jwt.strategy.ts:10`, 
    `server/src/auth/jwt.strategy.ts:12`

4. Use two users for collaboration demo
- User A (owner)
- User B (invitee/member)
- Register endpoint: 
    `server/src/auth/auth.controller.ts:21`
- Login endpoint: 
    `server/src/auth/auth.controller.ts:27`
- Unique email per user (prevents duplicates): 
    `server/src/user/user.entity.ts:17`, 
    `server/src/user/user.entity.ts:18`

### B) Suggested 8-12 minute demo flow

1. Login/Register
- register/login User A
- open boards page
- Frontend auth routes: 
    `client/src/app/app.routes.ts:11`, 
    `client/src/app/app.routes.ts:12`
- Protected boards routes: 
    `client/src/app/app.routes.ts:13`, 
    `client/src/app/app.routes.ts:14`
- Auth guard check + redirect: 
    `client/src/app/guards/auth.guard.ts:9`, 
    `client/src/app/guards/auth.guard.ts:10`
- Login submit + redirect to boards: 
    `client/src/app/auth/login.component.ts:37`, 
    `client/src/app/auth/login.component.ts:41`
- Register submit + redirect to boards: 
    `client/src/app/auth/register.component.ts:41`, 
    `client/src/app/auth/register.component.ts:48`
- Backend endpoints: 
    `server/src/auth/auth.controller.ts:21`, 
    `server/src/auth/auth.controller.ts:27`

2. Board CRUD + relation CRUD
- create board
- rename board
- share board (invite User B)
- show member/invite relation behavior (accept/decline/cancel/remove)
- Frontend board actions (create/rename/delete/share): 
    `client/src/app/board/board.component.ts:102`, 
    `client/src/app/board/board.component.ts:115`, 
    `client/src/app/board/board.component.ts:121`, 
    `client/src/app/board/board.component.ts:126`
- Frontend invite flow (accept/decline): 
    `client/src/app/board/board.component.ts:140`, 
    `client/src/app/board/board.component.ts:152`, 
    `client/src/app/board/board.component.ts:153`
- Board API client methods: 
    `client/src/app/services/board.service.ts:37`, 
    `client/src/app/services/board.service.ts:51`, 
    `client/src/app/services/board.service.ts:59`, 
    `client/src/app/services/board.service.ts:66`, 
    `client/src/app/services/board.service.ts:74`, 
    `client/src/app/services/board.service.ts:90`, 
    `client/src/app/services/board.service.ts:98`, 
    `client/src/app/services/board.service.ts:102`
- NgRx board effects for CRUD: 
    `client/src/app/state/boards/boards.effects.ts:37`, 
    `client/src/app/state/boards/boards.effects.ts:49`, 
    `client/src/app/state/boards/boards.effects.ts:61`
- Backend board routes: 
    `server/src/board/board.controller.ts:89`, 
    `server/src/board/board.controller.ts:96`, 
    `server/src/board/board.controller.ts:106`, 
    `server/src/board/board.controller.ts:132`
- Backend relation routes (invites/members): 
    `server/src/board/board.controller.ts:39`, 
    `server/src/board/board.controller.ts:45`, 
    `server/src/board/board.controller.ts:55`, 
    `server/src/board/board.controller.ts:61`, 
    `server/src/board/board.controller.ts:71`, 
    `server/src/board/board.controller.ts:77`
- Backend service logic: 
    `server/src/board/board.service.ts:75` (create), 
    `server/src/board/board.service.ts:79` (share), 
    `server/src/board/board.service.ts:127` (rename), 
    `server/src/board/board.service.ts:170` (delete), 
    `server/src/board/board.service.ts:244` (remove member), 
    `server/src/board/board.service.ts:299` (cancel invite), 
    `server/src/board/board.service.ts:321` (accept invite), 
    `server/src/board/board.service.ts:348` (decline invite)

3. Whiteboard realtime
- open same board in two sessions
- draw shapes/brush/eraser/fill
- demonstrate layers (add, rename, lock, visibility, reorder)
- show undo/redo and clear flow
- Client connection status badge: 
    `client/src/app/whiteboard/whiteboard.component.html:5`, 
    `client/src/app/whiteboard/whiteboard.component.html:6`
- Join board on socket connect: 
    `client/src/app/whiteboard/whiteboard.component.ts:170`, 
    `client/src/app/whiteboard/whiteboard.component.ts:172`
- Incoming realtime events: 
    `client/src/app/whiteboard/whiteboard.component.ts:253`, 
    `client/src/app/whiteboard/whiteboard.component.ts:254`, 
    `client/src/app/whiteboard/whiteboard.component.ts:267`, 
    `client/src/app/whiteboard/whiteboard.component.ts:279`, 
    `client/src/app/whiteboard/whiteboard.component.ts:310`
- Drawing tools + shape/fill emit: 
    `client/src/app/whiteboard/whiteboard.component.ts:599`, 
    `client/src/app/whiteboard/whiteboard.component.ts:654`, 
    `client/src/app/whiteboard/whiteboard.component.ts:663`, 
    `client/src/app/whiteboard/whiteboard.component.ts:857`
- Layers + order/visibility/lock: 
    `client/src/app/whiteboard/whiteboard.component.ts:1124`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1164`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1171`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1198`
- Undo/redo/clear: 
    `client/src/app/whiteboard/whiteboard.component.ts:1224`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1273`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1090`
- Backend socket handlers: 
    `server/src/board/board.gateway.ts:141` (join), 
    `server/src/board/board.gateway.ts:292` (draw), 
    `server/src/board/board.gateway.ts:379` (undo), 
    `server/src/board/board.gateway.ts:427` (redo), 
    `server/src/board/board.gateway.ts:561` (clear), 
    `server/src/board/board.gateway.ts:686` (layers:add), 
    `server/src/board/board.gateway.ts:717` (layers:rename), 
    `server/src/board/board.gateway.ts:744` (layers:toggle), 
    `server/src/board/board.gateway.ts:768` (layers:lock), 
    `server/src/board/board.gateway.ts:792` (layers:reorder), 
    `server/src/board/board.gateway.ts:819` (layers:delete)

4. RxJS intent highlights
- cursor updates are throttled/deduped
- autosave is debounced
- reconnect triggers resync pipeline
- Cursor dedupe + throttle: 
    `client/src/app/whiteboard/whiteboard.component.ts:347`, 
    `client/src/app/whiteboard/whiteboard.component.ts:350`
- Autosave debounce + retry: 
    `client/src/app/whiteboard/whiteboard.component.ts:1613`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1626`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1631`
- Reconnect/resync pipeline: 
    `client/src/app/whiteboard/whiteboard.component.ts:170`, 
    `client/src/app/whiteboard/whiteboard.component.ts:173`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1595`, 
    `client/src/app/whiteboard/whiteboard.component.ts:1602`
- Server resync endpoint: 
    `server/src/board/board.gateway.ts:611`

5. Auth hardening highlights
- short access token lifecycle
- refresh token rotation
- logout revokes refresh token server-side
- expired access token triggers interceptor refresh + retry
- Short access token lifecycle (`15m`): 
    `server/src/auth/auth.module.ts:25`
- Refresh token issue + TTL: 
    `server/src/auth/auth.service.ts:48`, 
    `server/src/auth/auth.service.ts:52`, 
    `server/src/auth/auth.service.ts:95`, 
    `server/src/auth/auth.service.ts:143`
- Refresh token rotation logic: 
    `server/src/auth/auth.service.ts:115`, 
    `server/src/auth/auth.service.ts:139`, 
    `server/src/auth/auth.service.ts:143`
- Logout revokes refresh token server-side: 
    `server/src/auth/auth.controller.ts:38`, 
    `server/src/auth/auth.service.ts:147`, 
    `server/src/user/user.service.ts:64`, 
    `server/src/user/user.service.ts:67`
- Stored refresh hash + expiry validation: 
    `server/src/user/user.service.ts:50`, 
    `server/src/user/user.service.ts:58`
- Expired access token -> interceptor refresh + retry: 
    `client/src/app/interceptors/auth.interceptor.ts:33`, 
    `client/src/app/interceptors/auth.interceptor.ts:46`, 
    `client/src/app/interceptors/auth.interceptor.ts:63`, 
    `client/src/app/interceptors/auth.interceptor.ts:68`
- Refresh persistence columns: 
    `server/src/user/user.entity.ts:27`, 
    `server/src/user/user.entity.ts:30`, 
    `server/src/migrations/1744700000000-AddRefreshTokenColumns.ts:8`, 
    `server/src/migrations/1744700000000-AddRefreshTokenColumns.ts:11`

6. Migration maturity highlight
- explain `synchronize: false`
- show migration scripts and applied status
- `synchronize: false` in runtime app config: 
    `server/src/app.module.ts:25`
- `synchronize: false` in migration data source: 
    `server/src/database/data-source.ts:18`
- Migration files: 
    `server/src/migrations/1744520000000-InitialSchema.ts:6`, 
    `server/src/migrations/1744700000000-AddRefreshTokenColumns.ts:6`
- Migration scripts used in demo: 
    `server/package.json:11`, 
    `server/package.json:13`

### C) Quick fallback plan -> code anchors

1. Refresh frontend
- Router + routes to recover view quickly: 
    `client/src/app/app.routes.ts:13`, 
    `client/src/app/app.routes.ts:14`

2. Re-login to refresh session
- Login flow + token save: 
    `client/src/app/auth/login.component.ts:37`, 
    `client/src/app/auth/login.component.ts:40`
- Token refresh fallback path: 
    `client/src/app/interceptors/auth.interceptor.ts:46`, 
    `client/src/app/interceptors/auth.interceptor.ts:63`

3. Re-open board from boards list
- Open board navigation: 
    `client/src/app/board/board.component.ts:107`, 
    `client/src/app/board/board.component.ts:108`

4. Restart backend and retry from login
- Backend start command: 
    `server/package.json:17`
- Auth endpoints after restart: 
    `server/src/auth/auth.controller.ts:27`, 
    `server/src/auth/auth.controller.ts:32`

## Quick global references

1. Requirements mapping: 
    `REQUIREMENTS_MAPPING.md`
2. Auth flow: 
    `server/src/auth/*`, 
    `client/src/app/interceptors/auth.interceptor.ts`
3. NgRx + RxJS: 
    `client/src/app/state/*`, 
    `client/src/app/whiteboard/whiteboard.component.ts`
4. Migrations: 
    `server/src/migrations/*`
