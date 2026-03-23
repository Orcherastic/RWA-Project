import { createFeatureSelector, createSelector } from '@ngrx/store';
import { boardsAdapter, BoardsState } from './boards.reducer';
import { Board } from './boards.models';

export const selectBoardsState = createFeatureSelector<BoardsState>('boards');

const { selectAll, selectEntities } = boardsAdapter.getSelectors(selectBoardsState);

export const selectAllBoards = selectAll;
export const selectBoardEntities = selectEntities;

export const selectBoardCount = createSelector(
  selectAllBoards,
  (boards: Board[]) => boards.length,
);
