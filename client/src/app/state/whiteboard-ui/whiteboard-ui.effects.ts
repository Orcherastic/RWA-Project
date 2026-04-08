import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, tap, withLatestFrom } from 'rxjs';
import {
  hydrateWhiteboardUi,
  hydrateWhiteboardUiSuccess,
  setActiveLayerId,
  setCurrentColor,
  setCurrentTool,
  setLineWidth,
  toggleGrid,
} from './whiteboard-ui.actions';
import { WhiteboardUiState } from './whiteboard-ui.reducer';
import { selectWhiteboardUiState } from './whiteboard-ui.selectors';

const STORAGE_KEY = 'whiteboardUiPrefs';

@Injectable()
export class WhiteboardUiEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);

  hydrate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(hydrateWhiteboardUi),
      map(() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return hydrateWhiteboardUiSuccess({ state: {} });
          const parsed = JSON.parse(raw) as Partial<WhiteboardUiState>;
          return hydrateWhiteboardUiSuccess({ state: parsed });
        } catch {
          return hydrateWhiteboardUiSuccess({ state: {} });
        }
      }),
    ),
  );

  persist$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          hydrateWhiteboardUiSuccess,
          setCurrentTool,
          toggleGrid,
          setActiveLayerId,
          setLineWidth,
          setCurrentColor,
        ),
        withLatestFrom(this.store.select(selectWhiteboardUiState)),
        tap(([, uiState]) => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(uiState));
          } catch {
            // Ignore persistence errors to avoid breaking the drawing flow.
          }
        }),
      ),
    { dispatch: false },
  );
}
