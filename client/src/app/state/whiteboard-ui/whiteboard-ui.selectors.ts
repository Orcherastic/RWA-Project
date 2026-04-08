import { createFeatureSelector, createSelector } from '@ngrx/store';
import { WhiteboardUiState } from './whiteboard-ui.reducer';

export const selectWhiteboardUiState =
  createFeatureSelector<WhiteboardUiState>('whiteboardUi');

export const selectWhiteboardTool = createSelector(
  selectWhiteboardUiState,
  (state) => state.currentTool,
);

export const selectWhiteboardGrid = createSelector(
  selectWhiteboardUiState,
  (state) => state.showGrid,
);

export const selectWhiteboardActiveLayer = createSelector(
  selectWhiteboardUiState,
  (state) => state.activeLayerId,
);

export const selectWhiteboardLineWidth = createSelector(
  selectWhiteboardUiState,
  (state) => state.lineWidth,
);

export const selectWhiteboardColor = createSelector(
  selectWhiteboardUiState,
  (state) => state.currentColor,
);
