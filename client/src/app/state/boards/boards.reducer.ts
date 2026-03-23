import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { Board } from './boards.models';
import {
  createBoardSuccess,
  deleteBoardSuccess,
  loadBoardsSuccess,
  renameBoardSuccess,
} from './boards.actions';

export interface BoardsState extends EntityState<Board> {}

export const boardsAdapter = createEntityAdapter<Board>({
  selectId: (board) => board.id,
});

export const initialState: BoardsState = boardsAdapter.getInitialState();

export const boardsReducer = createReducer(
  initialState,
  on(loadBoardsSuccess, (state, { boards }) => boardsAdapter.setAll(boards, state)),
  on(createBoardSuccess, (state, { board }) => boardsAdapter.addOne(board, state)),
  on(renameBoardSuccess, (state: BoardsState) => state),
  on(deleteBoardSuccess, (state: BoardsState) => state),
);
