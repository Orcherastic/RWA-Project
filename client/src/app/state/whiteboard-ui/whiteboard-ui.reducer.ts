import { createReducer, on } from '@ngrx/store';
import {
  hydrateWhiteboardUiSuccess,
  setActiveLayerId,
  setCurrentColor,
  setCurrentTool,
  setLineWidth,
  toggleGrid,
  WhiteboardTool,
} from './whiteboard-ui.actions';

export interface WhiteboardUiState {
  currentTool: WhiteboardTool;
  showGrid: boolean;
  activeLayerId: string;
  lineWidth: number;
  currentColor: string;
}

export const initialWhiteboardUiState: WhiteboardUiState = {
  currentTool: 'brush',
  showGrid: false,
  activeLayerId: 'layer-1',
  lineWidth: 2,
  currentColor: '#000000',
};

const clampLineWidth = (value: number) => Math.max(1, Math.min(40, Math.round(value)));

export const whiteboardUiReducer = createReducer(
  initialWhiteboardUiState,
  on(hydrateWhiteboardUiSuccess, (state, { state: hydrated }) => ({
    ...state,
    ...hydrated,
    lineWidth:
      typeof hydrated.lineWidth === 'number'
        ? clampLineWidth(hydrated.lineWidth)
        : state.lineWidth,
  })),
  on(setCurrentTool, (state, { tool }) => ({ ...state, currentTool: tool })),
  on(toggleGrid, (state) => ({ ...state, showGrid: !state.showGrid })),
  on(setActiveLayerId, (state, { layerId }) => ({ ...state, activeLayerId: layerId })),
  on(setLineWidth, (state, { lineWidth }) => ({
    ...state,
    lineWidth: clampLineWidth(lineWidth),
  })),
  on(setCurrentColor, (state, { color }) => ({ ...state, currentColor: color })),
);
