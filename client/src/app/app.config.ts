import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { boardsReducer } from './state/boards/boards.reducer';
import { BoardsEffects } from './state/boards/boards.effects';
import { whiteboardUiReducer } from './state/whiteboard-ui/whiteboard-ui.reducer';
import { WhiteboardUiEffects } from './state/whiteboard-ui/whiteboard-ui.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([AuthInterceptor])
    ),
    provideStore({ boards: boardsReducer, whiteboardUi: whiteboardUiReducer }),
    provideEffects([BoardsEffects, WhiteboardUiEffects]),
  ]
};
