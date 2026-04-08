import { createAction, props } from '@ngrx/store';

export type WhiteboardTool =
  | 'brush'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'fill'
  | 'select';

export const hydrateWhiteboardUi = createAction('[Whiteboard UI] Hydrate');
export const hydrateWhiteboardUiSuccess = createAction(
  '[Whiteboard UI] Hydrate Success',
  props<{
    state: Partial<{
      currentTool: WhiteboardTool;
      showGrid: boolean;
      activeLayerId: string;
      lineWidth: number;
      currentColor: string;
    }>;
  }>(),
);

export const setCurrentTool = createAction(
  '[Whiteboard UI] Set Tool',
  props<{ tool: WhiteboardTool }>(),
);

export const toggleGrid = createAction('[Whiteboard UI] Toggle Grid');

export const setActiveLayerId = createAction(
  '[Whiteboard UI] Set Active Layer',
  props<{ layerId: string }>(),
);

export const setLineWidth = createAction(
  '[Whiteboard UI] Set Line Width',
  props<{ lineWidth: number }>(),
);

export const setCurrentColor = createAction(
  '[Whiteboard UI] Set Current Color',
  props<{ color: string }>(),
);
