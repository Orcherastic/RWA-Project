import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { BoardService } from '../../services/board.service';
import {
  createBoard,
  createBoardFailure,
  createBoardSuccess,
  deleteBoard,
  deleteBoardFailure,
  deleteBoardSuccess,
  loadBoards,
  loadBoardsFailure,
  loadBoardsSuccess,
  renameBoard,
  renameBoardFailure,
  renameBoardSuccess,
} from './boards.actions';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';

@Injectable()
export class BoardsEffects {
  private readonly actions$ = inject(Actions);
  private readonly boardService = inject(BoardService);

  loadBoards$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadBoards),
      switchMap(() =>
        this.boardService.getBoards().pipe(
          map((boards) => loadBoardsSuccess({ boards })),
          catchError((error) => of(loadBoardsFailure({ error }))),
        ),
      ),
    ),
  );

  createBoard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(createBoard),
      mergeMap(({ title }) =>
        this.boardService.createBoard(title).pipe(
          map((board) => createBoardSuccess({ board })),
          catchError((error) => of(createBoardFailure({ error }))),
        ),
      ),
    ),
  );

  renameBoard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(renameBoard),
      mergeMap(({ id, title }) =>
        this.boardService.renameBoard(id, title).pipe(
          map(() => renameBoardSuccess()),
          catchError((error) => of(renameBoardFailure({ error }))),
        ),
      ),
    ),
  );

  deleteBoard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteBoard),
      mergeMap(({ id }) =>
        this.boardService.deleteBoard(id).pipe(
          map(() => deleteBoardSuccess()),
          catchError((error) => of(deleteBoardFailure({ error }))),
        ),
      ),
    ),
  );

  refreshAfterWrite$ = createEffect(() =>
    this.actions$.pipe(
      ofType(createBoardSuccess, renameBoardSuccess, deleteBoardSuccess),
      map(() => loadBoards()),
    ),
  );
}
