import { createAction, props } from '@ngrx/store';
import { Board } from './boards.models';

export const loadBoards = createAction('[Boards] Load');
export const loadBoardsSuccess = createAction(
  '[Boards] Load Success',
  props<{ boards: Board[] }>(),
);
export const loadBoardsFailure = createAction(
  '[Boards] Load Failure',
  props<{ error: unknown }>(),
);

export const createBoard = createAction(
  '[Boards] Create',
  props<{ title: string }>(),
);
export const createBoardSuccess = createAction(
  '[Boards] Create Success',
  props<{ board: Board }>(),
);
export const createBoardFailure = createAction(
  '[Boards] Create Failure',
  props<{ error: unknown }>(),
);

export const renameBoard = createAction(
  '[Boards] Rename',
  props<{ id: number; title: string }>(),
);
export const renameBoardSuccess = createAction('[Boards] Rename Success');
export const renameBoardFailure = createAction(
  '[Boards] Rename Failure',
  props<{ error: unknown }>(),
);

export const deleteBoard = createAction(
  '[Boards] Delete',
  props<{ id: number }>(),
);
export const deleteBoardSuccess = createAction('[Boards] Delete Success');
export const deleteBoardFailure = createAction(
  '[Boards] Delete Failure',
  props<{ error: unknown }>(),
);
