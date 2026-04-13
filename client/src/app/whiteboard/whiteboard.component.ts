import { Component, ElementRef, ViewChild, AfterViewInit, HostListener, OnInit,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';
import {
  EMPTY,
  Subject,
  fromEvent,
  merge,
  timer,
  throttleTime,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  retry,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { CursorService } from '../services/cursor.service';
import { AuthService } from '../auth/auth.service';
import { Store } from '@ngrx/store';
import {
  hydrateWhiteboardUi,
  setActiveLayerId,
  setCurrentColor,
  setCurrentTool,
  setLineWidth,
  toggleGrid as toggleGridAction,
} from '../state/whiteboard-ui/whiteboard-ui.actions';
import { selectWhiteboardUiState } from '../state/whiteboard-ui/whiteboard-ui.selectors';
import { BoardService } from '../services/board.service';

@Component({
  selector: 'app-whiteboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whiteboard.component.html',
  styleUrls: ['./whiteboard.component.scss'],
})
export class WhiteboardComponent implements AfterViewInit, OnInit {
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('cursorCanvas', { static: true })
  cursorCanvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('boardWrapper', { static: true })
  boardWrapperRef!: ElementRef<HTMLDivElement>;

  private cursorCtx!: CanvasRenderingContext2D;
  private readonly subscriptions: any[] = [];
  private readonly destroy$ = new Subject<void>();
  private readonly resyncTrigger$ = new Subject<void>();
  private readonly boardStateArrived$ = new Subject<void>();
  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private boardLoaded = false;
  boardId!: number;
  private strokes: DrawItem[] = [];
  undoStack: DrawAction[][] = [];
  redoStack: DrawAction[][] = [];
  private userId: number | null = null;
  private strokeSeq = 0;
  private boardVersion = 0;
  presenceUsers: Array<{ id: number; displayName: string }> = [];
  clearStatus: {
    approvals: number;
    required: number;
    approvers: number[];
    expiresAt: number | null;
  } | null = null;
  connectionStatus: 'online' | 'reconnecting' | 'offline' = 'offline';
  boardOwnerId: number | null = null;
  layers: Layer[] = [{ id: 'layer-1', name: 'Layer 1', visible: true, ownerId: -1, locked: false }];
  activeLayerId = 'layer-1';
  editingLayerId: string | null = null;
  layerNameDraft = '';
  layerNameError = '';
  shareCopied = false;
  showGrid = false;

  currentColor = '#000000';
  lineWidth = 2;
  currentTool: Tool = 'brush';
  readonly paletteColors = [
    '#000000',
    '#7f7f7f',
    '#ffffff',
    '#ff0000',
    '#ff7f00',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#0000ff',
    '#7f00ff',
    '#ff00ff',
    '#a52a2a',
    '#8b4513',
    '#f4a460',
    '#2e8b57',
    '#4682b4',
  ];
  recentColors: string[] = [];

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.store.dispatch(toggleGridAction());
  }

  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastCursorX: number | null = null;
  private lastCursorY: number | null = null;
  private activeStrokeId: string | null = null;
  private activeStrokeBuffer: DrawItem[] = [];
  private shapeStart: { x: number; y: number } | null = null;
  private previewShape: ShapeItem | null = null;
  private readonly cursorFadeMs = 1500;
  private readonly cursorDropMs = 4000;
  private constrainShape = false;
  private selectedShapeId: string | null = null;
  private isDraggingShape = false;
  private isResizingShape = false;
  private dragOffset: { x: number; y: number } | null = null;
  private resizeHandle: ResizeHandle | null = null;
  private selectionDirty = false;
  private selectedShapePreview: ShapeItem | null = null;
  private selectedShapeOriginal: ShapeItem | null = null;
  private shapeClipboard: ShapeItem | null = null;
  private layerCanvases = new Map<string, HTMLCanvasElement>();
  private layerContexts = new Map<string, CanvasRenderingContext2D>();
  private dirtyLayers = new Set<string>();
  private redrawScheduled = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly socketService: SocketService,
    private readonly cursorService: CursorService,
    private readonly authService: AuthService,
    private readonly boardService: BoardService,
    private readonly store: Store,
  ) {}
  
  ngOnInit() {
    this.boardId = Number(this.route.snapshot.paramMap.get('id'));
    this.userId = this.authService.getUserId();
    this.setupResyncPipeline();
    this.setupAutosavePipeline();
    this.store.dispatch(hydrateWhiteboardUi());
    this.subscriptions.push(
      this.store.select(selectWhiteboardUiState).subscribe((uiState) => {
        this.currentTool = uiState.currentTool;
        this.showGrid = uiState.showGrid;
        this.lineWidth = uiState.lineWidth;
        this.currentColor = uiState.currentColor;
        if (uiState.activeLayerId) {
          this.activeLayerId = uiState.activeLayerId;
        }
      }),
    );
    this.subscriptions.push(
      this.socketService.listen('connect').subscribe(() => {
        this.connectionStatus = 'online';
        this.socketService.emit('joinBoard', this.boardId);
        this.resyncTrigger$.next();
      })
    );
    this.subscriptions.push(
      this.socketService.listen('disconnect').subscribe(() => {
        this.connectionStatus = 'offline';
      })
    );
    this.subscriptions.push(
      this.socketService.listen('reconnect_attempt').subscribe(() => {
        this.connectionStatus = 'reconnecting';
      })
    );
    this.subscriptions.push(
      this.socketService.listen('board:state').subscribe(({ strokes, layers, version, ownerId }) => {
        this.strokes = Array.isArray(strokes)
          ? strokes.map((s, idx) => this.normalizeStroke(s, idx))
          : [];
        this.boardOwnerId = typeof ownerId === 'number' ? ownerId : this.boardOwnerId;
        if (Array.isArray(layers) && layers.length > 0) {
          this.layers = layers.map((l) => ({
            id: l.id,
            name: l.name,
            visible: l.visible !== false,
            ownerId: typeof l.ownerId === 'number' ? l.ownerId : -1,
            locked: l.locked === true,
          }));
          if (!this.layers.find((l) => l.id === this.activeLayerId)) {
            this.syncActiveLayerId(this.layers[0].id);
          }
          const keep = new Set(this.layers.map((l) => l.id));
          for (const key of this.layerCanvases.keys()) {
            if (!keep.has(key)) {
              this.layerCanvases.delete(key);
              this.layerContexts.delete(key);
              this.dirtyLayers.delete(key);
            }
          }
        }
        this.undoStack = [];
        this.redoStack = [];
        this.boardLoaded = true;
        this.boardVersion = typeof version === 'number' ? version : 0;
        this.boardStateArrived$.next();
        this.markAllLayersDirty();
        this.requestRedraw();
      })
    );

    this.subscriptions.push(
      this.socketService
        .listen('cursor:update')
        .subscribe(({ userId, x, y, displayName, color, tool }) => {
          if (!userId) return;
          this.cursorService.set(
            userId,
            x,
            y,
            displayName ?? `User ${userId}`,
            color ?? '#e53935',
            (tool ?? 'brush') as Tool,
          );
        })
    );

    this.subscriptions.push(
      this.socketService.listen('cursor:leave').subscribe(({ userId }) => {
        this.cursorService.remove(userId);
      })
    )}

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.boardId = Number(this.route.snapshot.paramMap.get('id'));
    this.resizeCanvases();

    this.socketService.emit('joinBoard', this.boardId);

    this.socketService.listen('draw').subscribe((data) => this.drawFromServer(data));
    this.socketService.listen('undo').subscribe(({ strokeId, version }) => {
      if (this.shouldResync(version)) return;
      if (!strokeId) return;
      const removed = this.strokes.filter((s) => s.strokeId === strokeId);
      if (removed.length === 0) return;
      this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
      for (const item of removed) {
        this.dirtyLayers.add(item.layerId);
      }
      this.requestRedraw();
    });
    this.socketService.listen('clear').subscribe(({ version }) => {
      if (this.shouldResync(version)) return;
      this.clearLocal();
      this.strokes = [];
      this.undoStack = [];
      this.redoStack = [];
      this.clearStatus = null;
    });
    this.socketService.listen('clear:status').subscribe((status) => {
      this.clearStatus = status;
    });
    this.socketService.listen('shape:update').subscribe((data) => {
      if (this.shouldResync(data?.version)) return;
      if (!data?.id) return;
      const idx = this.strokes.findIndex((s) => s.type === 'shape' && s.id === data.id);
      if (idx >= 0) {
        const updated = this.normalizeStroke({ ...data, type: 'shape' }, idx) as ShapeItem;
        this.strokes[idx] = updated;
        this.dirtyLayers.add(updated.layerId);
        this.requestRedraw();
      }
    });
    this.socketService.listen('shape:delete').subscribe(({ id, version }) => {
      if (this.shouldResync(version)) return;
      if (!id) return;
      const removed = this.strokes.filter((s) => s.type === 'shape' && s.id === id);
      if (removed.length === 0) return;
      this.strokes = this.strokes.filter((s) => !(s.type === 'shape' && s.id === id));
      for (const item of removed) {
        this.dirtyLayers.add(item.layerId);
      }
      if (this.selectedShapeId === id) {
        this.selectedShapeId = null;
        this.selectedShapeOriginal = null;
        this.selectedShapePreview = null;
        this.selectionDirty = false;
      }
      this.requestRedraw();
    });
    this.socketService.listen('presence:update').subscribe(({ users }) => {
      this.presenceUsers = Array.isArray(users) ? users : [];
    });
    this.socketService.listen('layers:update').subscribe(({ layers }) => {
      if (Array.isArray(layers) && layers.length > 0) {
        this.layers = layers.map((l) => ({
          id: l.id,
          name: l.name,
          visible: l.visible !== false,
          ownerId: typeof l.ownerId === 'number' ? l.ownerId : -1,
          locked: l.locked === true,
        }));
        if (!this.layers.find((l) => l.id === this.activeLayerId)) {
          this.syncActiveLayerId(this.layers[0].id);
        }
        const keep = new Set(this.layers.map((l) => l.id));
        for (const key of this.layerCanvases.keys()) {
          if (!keep.has(key)) {
            this.layerCanvases.delete(key);
            this.layerContexts.delete(key);
            this.dirtyLayers.delete(key);
          }
        }
        this.requestRedraw();
      }
    });

    const cursor = this.cursorCanvasRef.nativeElement;
    this.cursorCtx = cursor.getContext('2d')!;
    this.startCursorRenderLoop();

    fromEvent<MouseEvent>(canvas, 'mousemove')
      .pipe(
        map((event) => this.getCanvasCoords(event)),
        filter(({ inside }) => inside),
        map(({ x, y }) => ({
          x: Math.round(x * 2) / 2,
          y: Math.round(y * 2) / 2,
          tool: this.currentTool,
        })),
        distinctUntilChanged(
          (a, b) => a.x === b.x && a.y === b.y && a.tool === b.tool,
        ),
        throttleTime(33),
        takeUntil(this.destroy$),
      )
      .subscribe(({ x, y, tool }) => {
        this.lastCursorX = x;
        this.lastCursorY = y;
        if (!this.boardLoaded) return;
        this.socketService.emit('cursor:move', {
          boardId: this.boardId,
          x,
          y,
          tool,
        });
      });

    fromEvent<MouseEvent>(canvas, 'mouseleave')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.lastCursorX = null;
        this.lastCursorY = null;
        this.socketService.emit('cursor:leave', {
          boardId: this.boardId,
        });
      });

  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.resyncTrigger$.complete();
    this.boardStateArrived$.complete();
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.socketService.emit('leaveBoard', {});
    this.socketService.emit('cursor:leave', {
      boardId: this.boardId,
    });
    this.cursorService.clear();
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvases();
  }

  private resizeCanvases() {
    const wrapper = this.boardWrapperRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;
    const cursor = this.cursorCanvasRef?.nativeElement;
    if (!wrapper || !canvas || !cursor) return;

    const width = Math.max(300, Math.floor(wrapper.clientWidth));
    const height = Math.max(300, Math.floor(wrapper.clientHeight));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      cursor.width = width;
      cursor.height = height;
      this.markAllLayersDirty();
      this.requestRedraw();
    }
  }

  private redrawAll() {
    const canvas = this.canvasRef.nativeElement;
    this.resetComposite();
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    const orderedLayers = [...this.layers].reverse();
    for (const layer of orderedLayers) {
      if (!layer.visible) continue;
      const layerCanvas = this.getLayerCanvas(layer.id);
      const layerCtx = this.getLayerContext(layer.id);
      if (!layerCtx) continue;
      if (this.dirtyLayers.has(layer.id)) {
        this.rebuildLayer(layer.id);
      }
      this.ctx.drawImage(layerCanvas, 0, 0);
    }
  }

  private requestRedraw() {
    if (this.redrawScheduled) return;
    this.redrawScheduled = true;
    requestAnimationFrame(() => {
      this.redrawScheduled = false;
      this.redrawAll();
    });
  }

  private markAllLayersDirty() {
    for (const layer of this.layers) {
      this.dirtyLayers.add(layer.id);
    }
  }

  private getLayerCanvas(layerId: string) {
    const canvas = this.canvasRef.nativeElement;
    let layerCanvas = this.layerCanvases.get(layerId);
    if (!layerCanvas) {
      layerCanvas = document.createElement('canvas');
      layerCanvas.width = canvas.width;
      layerCanvas.height = canvas.height;
      this.layerCanvases.set(layerId, layerCanvas);
      this.dirtyLayers.add(layerId);
    } else if (layerCanvas.width !== canvas.width || layerCanvas.height !== canvas.height) {
      layerCanvas.width = canvas.width;
      layerCanvas.height = canvas.height;
      this.dirtyLayers.add(layerId);
    }
    return layerCanvas;
  }

  private getLayerContext(layerId: string): CanvasRenderingContext2D | undefined {
    let ctx = this.layerContexts.get(layerId);
    if (!ctx) {
      const canvas = this.getLayerCanvas(layerId);
      const next = canvas.getContext('2d');
      if (next) {
        this.layerContexts.set(layerId, next);
        ctx = next;
      }
    }
    return ctx;
  }

  private rebuildLayer(layerId: string) {
    const layerCanvas = this.getLayerCanvas(layerId);
    const layerCtx = this.getLayerContext(layerId);
    if (!layerCtx) return;
    layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    for (const stroke of this.strokes) {
      if (stroke.layerId !== layerId) continue;
      if (stroke.type === 'stroke') {
        this.applyStrokeStyleTo(layerCtx, stroke);
        layerCtx.beginPath();
        layerCtx.moveTo(stroke.fromX, stroke.fromY);
        layerCtx.lineTo(stroke.toX, stroke.toY);
        layerCtx.stroke();
        this.resetCompositeTo(layerCtx);
      } else if (stroke.type === 'shape') {
        this.drawShape(layerCtx, stroke);
      } else {
        this.applyFillOnContext(layerCtx, stroke, layerCanvas.width, layerCanvas.height);
      }
    }
    this.dirtyLayers.delete(layerId);
  }

  private startCursorRenderLoop() {
    const render = () => {
      this.cursorCtx.clearRect(
        0,
        0,
        this.cursorCanvasRef.nativeElement.width,
        this.cursorCanvasRef.nativeElement.height
      );

      if (this.previewShape) {
        this.drawShape(this.cursorCtx, this.previewShape, true);
      }
      const livePreview = this.getLiveShapePreview();
      if (livePreview) {
        this.drawShape(this.cursorCtx, livePreview, true);
      }
      this.drawBrushPreview();
      this.drawSelectionOverlay();

      const now = Date.now();
      for (const [userId, cursor] of this.cursorService.all().entries()) {
        const age = now - cursor.lastSeen;
        const alpha = Math.max(0.2, 1 - age / this.cursorFadeMs);

        this.cursorCtx.beginPath();
        this.cursorCtx.arc(cursor.x, cursor.y, 4, 0, Math.PI * 2);
        this.cursorCtx.fillStyle = this.applyAlpha(cursor.color, alpha);
        this.cursorCtx.fill();

        if (this.userId === null || this.userId !== userId) {
          const label = `${cursor.displayName} [${this.toolLabel(cursor.tool)}]`;
          this.cursorCtx.font = '12px Arial';
          this.cursorCtx.fillStyle = this.applyAlpha(cursor.color, alpha);
          this.cursorCtx.fillText(label, cursor.x + 8, cursor.y - 8);
        }
      }

      this.cursorService.pruneStale(this.cursorDropMs);
      requestAnimationFrame(render);
    };

    render();
  }

  private getCanvasCoords(event: MouseEvent) {
    const canvasEl = this.canvasRef.nativeElement;
    const rect = canvasEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private isPointInsideCanvas(x: number, y: number) {
    const canvasEl = this.canvasRef.nativeElement;
    return x >= 0 && y >= 0 && x <= canvasEl.width && y <= canvasEl.height;
  }

  onMouseDown(event: MouseEvent) {
    if (!this.boardLoaded) return;
    if (!this.canDrawOnLayer(this.activeLayerId)) return;
    if (event.button === 2) {
      this.cancelActiveDrawing();
      return;
    }
    if (event.button !== 0) return;
    const { x, y, inside } = this.getCanvasCoords(event);
    if (!inside) return;

    if (this.currentTool === 'select') {
      const hit = this.hitTestShape(x, y);
      if (!hit) {
        this.selectedShapeId = null;
        this.isDraggingShape = false;
        this.isResizingShape = false;
        this.resizeHandle = null;
        this.selectedShapePreview = null;
        this.selectedShapeOriginal = null;
        return;
      }
      this.selectedShapeId = hit.shape.id;
      this.selectedShapeOriginal = this.cloneShape(hit.shape);
      this.selectedShapePreview = this.cloneShape(hit.shape);
      if (hit.handle) {
        this.isResizingShape = true;
        this.resizeHandle = hit.handle;
      } else {
        this.isDraggingShape = true;
        this.dragOffset = { x: x - hit.shape.x1, y: y - hit.shape.y1 };
      }
      this.selectionDirty = false;
      return;
    }

    this.drawing = true;
    this.lastX = x;
    this.lastY = y;
    this.activeStrokeId = this.createStrokeId();
    this.activeStrokeBuffer = [];

    if (this.currentTool === 'fill') {
      const shapeToFill = this.hitTestShapeBody(x, y);
      if (shapeToFill && shapeToFill.shapeType !== 'line') {
        const idx = this.strokes.findIndex(
          (s) => s.type === 'shape' && s.id === shapeToFill.id,
        );
        if (idx >= 0) {
          const before = this.cloneShape(shapeToFill);
          const after = this.cloneShape(shapeToFill);
          after.fillColor = this.currentColor;
          this.strokes[idx] = after;
          this.undoStack.push([
            {
              type: 'update',
              targetId: after.id,
              before,
              after,
            },
          ]);
          this.redoStack = [];
          this.dirtyLayers.add(after.layerId);
          this.requestRedraw();
          this.socketService.emit('shape:update', {
            ...after,
          });
          this.boardVersion += 1;
        }
        this.drawing = false;
        this.activeStrokeId = null;
        return;
      }

      const strokeId = this.activeStrokeId;
      const segmentId = this.createSegmentId(strokeId);
      const fillItem: FillItem = {
        id: segmentId,
        strokeId,
        userId: this.userId ?? -1,
        type: 'fill',
        x,
        y,
        color: this.currentColor,
        tolerance: 16,
        tool: 'fill',
        layerId: this.activeLayerId,
      };
      this.strokes.push(fillItem);
      this.undoStack.push([fillItem]);
      this.redoStack = [];
      const layerCtx = this.getLayerContext(this.activeLayerId);
      const layerCanvas = this.getLayerCanvas(this.activeLayerId);
      if (layerCtx) {
        this.applyFillOnContext(layerCtx, fillItem, layerCanvas.width, layerCanvas.height);
      }
      this.requestRedraw();
      this.socketService.emit('draw', {
        ...fillItem,
      });
      this.boardVersion += 1;
      this.drawing = false;
      this.activeStrokeId = null;
      return;
    }

    if (this.isShapeTool(this.currentTool)) {
      this.shapeStart = { x, y };
      this.previewShape = this.createPreviewShape(
        this.currentTool,
        x,
        y,
        x,
        y,
      );
      return;
    }

    // Drawing happens on per-layer caches; compositing is handled in redrawAll.
  }

  onCanvasContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  onMouseMove(event: MouseEvent) {
    const { x, y, inside } = this.getCanvasCoords(event);
    if (inside) {
      this.lastCursorX = x;
      this.lastCursorY = y;
    }
    if (this.currentTool === 'select') {
      if (!this.selectedShapeId) return;
      const shape = this.selectedShapeOriginal;
      if (!shape) return;
      if (this.isDraggingShape && this.dragOffset) {
        const dx = x - this.dragOffset.x;
        const dy = y - this.dragOffset.y;
        const w = shape.x2 - shape.x1;
        const h = shape.y2 - shape.y1;
        const preview = this.cloneShape(shape);
        preview.x1 = dx;
        preview.y1 = dy;
        preview.x2 = dx + w;
        preview.y2 = dy + h;
        this.selectedShapePreview = preview;
        this.selectionDirty = true;
      } else if (this.isResizingShape && this.resizeHandle) {
        const preview = this.cloneShape(shape);
        this.applyResize(preview, this.resizeHandle, x, y);
        this.selectedShapePreview = preview;
        this.selectionDirty = true;
      }
      return;
    }

    if (!this.drawing || this.lastX === null || this.lastY === null) return;
    if (!inside) {
      if (!this.isShapeTool(this.currentTool)) {
        this.drawing = false;
        this.lastX = this.lastY = null;
        if (this.activeStrokeBuffer.length > 0) {
          this.undoStack.push(this.activeStrokeBuffer);
          this.activeStrokeBuffer = [];
          this.activeStrokeId = null;
        }
      }
      return;
    }

    if (this.isShapeTool(this.currentTool)) {
      this.lastX = x;
      this.lastY = y;
      if (this.shapeStart) {
        const adjusted = this.applyConstrain(
          this.currentTool,
          this.shapeStart.x,
          this.shapeStart.y,
          x,
          y,
        );
        this.previewShape = this.createPreviewShape(
          this.currentTool,
          this.shapeStart.x,
          this.shapeStart.y,
          adjusted.x2,
          adjusted.y2,
        );
      }
      return;
    }

    const fromX = this.lastX;
    const fromY = this.lastY;
    const strokeId = this.activeStrokeId ?? this.createStrokeId();
    const segmentId = this.createSegmentId(strokeId);
    const strokeUserId = this.userId ?? -1;

    // Save stroke for persistence
    const stroke: DrawItem = {
      id: segmentId,
      strokeId,
      userId: strokeUserId,
      type: 'stroke',
      fromX,
      fromY,
      toX: x,
      toY: y,
      color: this.currentColor,
      lineWidth: this.lineWidth,
      tool: this.currentTool,
      layerId: this.activeLayerId,
    };
    this.strokes.push(stroke);
    if (this.userId !== null) {
      this.activeStrokeBuffer.push(stroke);
      this.redoStack = [];
    }
    const layerCtx = this.getLayerContext(this.activeLayerId);
    if (layerCtx) {
      this.applyStrokeStyleTo(layerCtx, stroke);
      layerCtx.beginPath();
      layerCtx.moveTo(fromX, fromY);
      layerCtx.lineTo(x, y);
      layerCtx.stroke();
      this.resetCompositeTo(layerCtx);
    }
    this.requestRedraw();

    // Update last position
    this.lastX = x;
    this.lastY = y;

    // Emit for others
    this.socketService.emit('draw', {
      type: 'stroke',
      id: segmentId,
      strokeId,
      fromX,
      fromY,
      toX: x,
      toY: y,
      color: this.currentColor,
      lineWidth: this.lineWidth,
      tool: this.currentTool,
      layerId: this.activeLayerId,
    });
    this.boardVersion += 1;

    // Debounced save trigger
  }

  onMouseUp() {
    if (this.drawing) {
      this.drawing = false;
      // optional: end path
      this.ctx.beginPath();
    }
  }

  onMouseLeave() {
    // make sure drawing stops if cursor leaves canvas
    this.drawing = false;
  }

  stopDrawing() {
    if (this.drawing) {
      this.drawing = false;
      this.lastX = this.lastY = null;
      if (this.activeStrokeBuffer.length > 0) {
        this.undoStack.push(this.activeStrokeBuffer);
        this.activeStrokeBuffer = [];
        this.activeStrokeId = null;
      }
      if (
        this.isShapeTool(this.currentTool) &&
        this.shapeStart &&
        this.previewShape &&
        this.isPointInsideCanvas(this.previewShape.x2, this.previewShape.y2)
      ) {
        const strokeId = this.activeStrokeId ?? this.createStrokeId();
        const shapeItem = this.createShapeItem(
          strokeId,
          this.previewShape.shapeType,
          this.previewShape.x1,
          this.previewShape.y1,
          this.previewShape.x2,
          this.previewShape.y2,
        );

        this.strokes.push(shapeItem);
        this.undoStack.push([shapeItem]);
        this.redoStack = [];
        const layerCtx = this.getLayerContext(this.activeLayerId);
        if (layerCtx) {
          this.drawShape(layerCtx, shapeItem);
        }
        this.requestRedraw();
        this.socketService.emit('draw', {
          type: 'shape',
          id: shapeItem.id,
          strokeId,
          userId: this.userId ?? -1,
          shapeType: shapeItem.shapeType,
          x1: shapeItem.x1,
          y1: shapeItem.y1,
          x2: shapeItem.x2,
          y2: shapeItem.y2,
          color: shapeItem.color,
          lineWidth: shapeItem.lineWidth,
          tool: shapeItem.tool,
          layerId: shapeItem.layerId,
        });
        this.boardVersion += 1;
      }
      this.shapeStart = null;
      this.previewShape = null;
      this.activeStrokeId = null;
    }
    if (this.currentTool === 'select') {
      if (
        this.selectionDirty &&
        this.selectedShapeId &&
        this.selectedShapePreview &&
        this.selectedShapeOriginal
      ) {
        const idx = this.strokes.findIndex(
          (s) => s.type === 'shape' && s.id === this.selectedShapeId,
        );
        if (idx >= 0) {
          const before = this.cloneShape(this.selectedShapeOriginal);
          const after = this.cloneShape(this.selectedShapePreview);
          this.strokes[idx] = after;
          this.dirtyLayers.add(after.layerId);
          this.requestRedraw();
          this.socketService.emit('shape:update', {
            ...after,
          });
          this.undoStack.push([
            {
              type: 'update',
              targetId: after.id,
              before,
              after,
            },
          ]);
          this.redoStack = [];
        }
      }
      this.isDraggingShape = false;
      this.isResizingShape = false;
      this.dragOffset = null;
      this.resizeHandle = null;
      this.selectionDirty = false;
      this.selectedShapeOriginal = null;
      this.selectedShapePreview = null;
    }
  }

  private cancelActiveDrawing() {
    if (!this.drawing) return;
    if (this.currentTool === 'fill') return;

    this.drawing = false;
    this.lastX = this.lastY = null;

    if (this.isShapeTool(this.currentTool)) {
      this.shapeStart = null;
      this.previewShape = null;
      this.activeStrokeId = null;
      return;
    }

    const strokeId = this.activeStrokeId;
    this.activeStrokeBuffer = [];
    this.activeStrokeId = null;
    if (!strokeId) return;

    const removed = this.strokes.filter((s) => s.strokeId === strokeId);
    if (removed.length === 0) return;

    this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
    for (const item of removed) {
      this.dirtyLayers.add(item.layerId);
    }
    this.requestRedraw();
    this.socketService.emit('undo', { boardId: this.boardId, strokeId });
    this.boardVersion += 1;
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const key = event.key.toLowerCase();
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    if (event.key === 'Shift') {
      this.constrainShape = true;
    }

    if (ctrlOrMeta && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
      return;
    }

    if (ctrlOrMeta && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.redo();
      return;
    }

    if (ctrlOrMeta && key === 'c') {
      event.preventDefault();
      this.copySelectedShape();
      return;
    }

    if (ctrlOrMeta && key === 'v') {
      event.preventDefault();
      this.pasteShapeFromClipboard();
      return;
    }

    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      this.deleteSelectedShape();
      return;
    }

    if (!ctrlOrMeta && key === 'b') {
      event.preventDefault();
      this.setTool('brush');
      return;
    }

    if (!ctrlOrMeta && key === 'e') {
      event.preventDefault();
      this.setTool('eraser');
      return;
    }

    if (!ctrlOrMeta && key === 'f') {
      event.preventDefault();
      this.setTool('fill');
      return;
    }
    if (!ctrlOrMeta && key === 's') {
      event.preventDefault();
      this.setTool('select');
      return;
    }

    if (!ctrlOrMeta && key === 'l') {
      event.preventDefault();
      this.setTool('line');
      return;
    }

    if (!ctrlOrMeta && key === 'r') {
      event.preventDefault();
      this.setTool('rect');
      return;
    }

    if (!ctrlOrMeta && key === 'c') {
      event.preventDefault();
      this.setTool('circle');
      return;
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.constrainShape = false;
    }
  }

  drawFromServer(data: any) {
    if (!this.ctx) return;

    if (data.type === 'stroke') {
      if (this.shouldResync(data.version)) return;
      const normalized = this.normalizeStroke(data, this.strokes.length);
      this.strokes.push(normalized);
      const layerCtx = this.getLayerContext(normalized.layerId);
      if (layerCtx && normalized.type === 'stroke') {
        this.applyStrokeStyleTo(layerCtx, normalized);
        layerCtx.beginPath();
        layerCtx.moveTo(normalized.fromX, normalized.fromY);
        layerCtx.lineTo(normalized.toX, normalized.toY);
        layerCtx.stroke();
        this.resetCompositeTo(layerCtx);
      }
      this.requestRedraw();
    }
    if (data.type === 'shape') {
      if (this.shouldResync(data.version)) return;
      const shape = this.normalizeStroke(data, this.strokes.length) as ShapeItem;
      this.strokes.push(shape);
      const layerCtx = this.getLayerContext(shape.layerId);
      if (layerCtx) {
        this.drawShape(layerCtx, shape);
      }
      this.requestRedraw();
    }
    if (data.type === 'fill') {
      if (this.shouldResync(data.version)) return;
      const fill = this.normalizeStroke(data, this.strokes.length) as FillItem;
      this.strokes.push(fill);
      const layerCtx = this.getLayerContext(fill.layerId);
      const layerCanvas = this.getLayerCanvas(fill.layerId);
      if (layerCtx) {
        this.applyFillOnContext(layerCtx, fill, layerCanvas.width, layerCanvas.height);
      }
      this.requestRedraw();
    }
  }

  clearBoard() {
    this.socketService.emit('clear', {});
  }

  clearLocal() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.layerCanvases.clear();
    this.layerContexts.clear();
    this.dirtyLayers.clear();
  }

  setTool(tool: Tool) {
    this.currentTool = tool;
    this.store.dispatch(setCurrentTool({ tool }));
    if (this.lastCursorX !== null && this.lastCursorY !== null) {
      this.socketService.emit('cursor:move', {
        boardId: this.boardId,
        x: this.lastCursorX,
        y: this.lastCursorY,
        tool: this.currentTool,
      });
    }
    if (tool !== 'select') {
      this.selectedShapeId = null;
      this.isDraggingShape = false;
      this.isResizingShape = false;
      this.dragOffset = null;
      this.resizeHandle = null;
      this.selectionDirty = false;
    }
  }

  addLayer() {
    if (this.layers.length >= 10) return;
    this.socketService.emit('layers:add', {});
  }

  selectLayer(id: string) {
    this.syncActiveLayerId(id);
  }

  startRenameLayer(layer: Layer) {
    if (!this.canManageLayer(layer)) return;
    this.editingLayerId = layer.id;
    this.layerNameDraft = layer.name;
    this.layerNameError = '';
  }

  cancelRenameLayer() {
    this.editingLayerId = null;
    this.layerNameDraft = '';
    this.layerNameError = '';
  }

  saveRenameLayer(layer: Layer) {
    if (!this.canManageLayer(layer)) return;
    const name = this.layerNameDraft.trim();
    if (!name) {
      this.layerNameError = 'Name required';
      return;
    }
    const exists = this.layers.some(
      (l) => l.id !== layer.id && l.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      this.layerNameError = 'Name already used';
      return;
    }
    this.socketService.emit('layers:rename', { layerId: layer.id, name });
    this.cancelRenameLayer();
  }

  toggleLayerVisibility(id: string) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    if (!this.canManageLayer(layer)) return;
    this.socketService.emit('layers:toggle', { layerId: id, visible: !layer.visible });
  }

  toggleLayerLock(id: string) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    if (!this.canManageLayer(layer)) return;
    this.socketService.emit('layers:lock', { layerId: id, locked: !layer.locked });
  }

  deleteLayer(id: string) {
    if (this.layers.length <= 1) return;
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    if (!this.canManageLayer(layer)) return;
    const ok = window.confirm(`Delete "${layer.name}" and all of its drawings?`);
    if (!ok) return;
    this.socketService.emit('layers:delete', { layerId: id });
  }

  moveLayer(id: string, direction: 'up' | 'down') {
    if (!this.isBoardOwner()) return;
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= this.layers.length) return;
    const copy = [...this.layers];
    const [layer] = copy.splice(idx, 1);
    copy.splice(target, 0, layer);
    this.layers = copy;
    this.socketService.emit('layers:reorder', { order: this.layers.map((l) => l.id) });
    this.requestRedraw();
  }

  setColor(color: string) {
    this.currentColor = color;
    this.store.dispatch(setCurrentColor({ color }));
    this.pushRecentColor(color);
  }

  updateLineWidth(value: number | string) {
    const lineWidth = Number(value);
    if (Number.isNaN(lineWidth)) return;
    this.lineWidth = lineWidth;
    this.store.dispatch(setLineWidth({ lineWidth }));
  }

  onColorInput(value: string) {
    this.setColor(value);
  }

  private syncActiveLayerId(layerId: string) {
    this.activeLayerId = layerId;
    this.store.dispatch(setActiveLayerId({ layerId }));
  }

  undo() {
    if (!this.userId || this.undoStack.length === 0) return;
    const group = this.undoStack.pop()!;
    this.redoStack.push(group);
    const first = group[0];
    if (first?.type === 'update') {
      const idx = this.strokes.findIndex(
        (s) => s.type === 'shape' && s.id === first.targetId,
      );
      if (idx >= 0) {
        this.strokes[idx] = this.cloneShape(first.before);
        this.dirtyLayers.add(first.before.layerId);
        this.requestRedraw();
        this.socketService.emit('shape:update', {
          ...first.before,
        });
      }
      return;
    }
    if (first?.type === 'delete') {
      const restored = this.cloneShape(first.item);
      const insertAt = Math.max(0, Math.min(first.index, this.strokes.length));
      this.strokes.splice(insertAt, 0, restored);
      this.selectedShapeId = restored.id;
      this.selectedShapeOriginal = this.cloneShape(restored);
      this.selectedShapePreview = this.cloneShape(restored);
      this.selectionDirty = false;
      this.dirtyLayers.add(restored.layerId);
      this.requestRedraw();
      this.socketService.emit('draw', {
        ...restored,
      });
      this.boardVersion += 1;
      return;
    }
    const strokeId = (first as DrawItem)?.strokeId;
    if (!strokeId) return;
    const removed = this.strokes.filter((s) => s.strokeId === strokeId);
    this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
    for (const item of removed) {
      this.dirtyLayers.add(item.layerId);
    }
    this.requestRedraw();
    this.socketService.emit('undo', { boardId: this.boardId, strokeId });
    this.boardVersion += 1;
  }

  redo() {
    if (!this.userId || this.redoStack.length === 0) return;
    const group = this.redoStack.pop()!;
    this.undoStack.push(group);
    const first = group[0];
    if (first?.type === 'update') {
      const idx = this.strokes.findIndex(
        (s) => s.type === 'shape' && s.id === first.targetId,
      );
      if (idx >= 0) {
        this.strokes[idx] = this.cloneShape(first.after);
        this.dirtyLayers.add(first.after.layerId);
        this.requestRedraw();
        this.socketService.emit('shape:update', {
          ...first.after,
        });
      }
      return;
    }
    if (first?.type === 'delete') {
      const idx = this.strokes.findIndex(
        (s) => s.type === 'shape' && s.id === first.item.id,
      );
      if (idx >= 0) {
        const [removed] = this.strokes.splice(idx, 1);
        this.dirtyLayers.add(removed.layerId);
        this.requestRedraw();
      }
      if (this.selectedShapeId === first.item.id) {
        this.selectedShapeId = null;
        this.selectedShapeOriginal = null;
        this.selectedShapePreview = null;
        this.selectionDirty = false;
      }
      this.socketService.emit('shape:delete', {
        id: first.item.id,
      });
      this.boardVersion += 1;
      return;
    }
    const items = group as DrawItem[];
    this.strokes.push(...items);
    for (const item of items) {
      const layerCtx = this.getLayerContext(item.layerId);
      if (!layerCtx) {
        this.dirtyLayers.add(item.layerId);
        continue;
      }
      if (item.type === 'stroke') {
        this.applyStrokeStyleTo(layerCtx, item);
        layerCtx.beginPath();
        layerCtx.moveTo(item.fromX, item.fromY);
        layerCtx.lineTo(item.toX, item.toY);
        layerCtx.stroke();
        this.resetCompositeTo(layerCtx);
      } else if (item.type === 'shape') {
        this.drawShape(layerCtx, item);
      } else {
        const layerCanvas = this.getLayerCanvas(item.layerId);
        this.applyFillOnContext(layerCtx, item, layerCanvas.width, layerCanvas.height);
      }
    }
    this.requestRedraw();
    const strokeId = (first as DrawItem)?.strokeId;
    if (!strokeId) return;
    this.socketService.emit('redo', { boardId: this.boardId, strokeId, strokes: group });
    this.boardVersion += 1;
  }

  hasApprovedClear() {
    const uid = this.userId ?? -1;
    return !!this.clearStatus?.approvers?.includes(uid);
  }

  exportPng() {
    const canvas = this.canvasRef.nativeElement;
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    const ctx = temp.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0);
    // Exclude cursors from export
    // ctx.drawImage(cursorCanvas, 0, 0);
    const dataUrl = temp.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `board-${this.boardId}.png`;
    a.click();
  }

  async copyShareLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied = true;
      setTimeout(() => {
        this.shareCopied = false;
      }, 1500);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.shareCopied = true;
      setTimeout(() => {
        this.shareCopied = false;
      }, 1500);
    }
  }

  private applyStrokeStyle(stroke: { color?: string; lineWidth?: number; tool?: string }) {
    const tool = stroke.tool ?? 'brush';
    if (tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color ?? this.currentColor;
    }
    this.ctx.lineWidth = this.getEffectiveLineWidth(tool, stroke.lineWidth ?? this.lineWidth);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private resetComposite() {
    this.ctx.globalCompositeOperation = 'source-over';
  }

  private applyStrokeStyleTo(
    ctx: CanvasRenderingContext2D,
    stroke: { color?: string; lineWidth?: number; tool?: string },
  ) {
    const tool = stroke.tool ?? 'brush';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color ?? this.currentColor;
    }
    ctx.lineWidth = this.getEffectiveLineWidth(tool, stroke.lineWidth ?? this.lineWidth);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  private resetCompositeTo(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'source-over';
  }

  private createStrokeId() {
    const uid = this.userId ?? 0;
    this.strokeSeq += 1;
    return `${uid}-${Date.now()}-${this.strokeSeq}`;
  }

  private createSegmentId(strokeId: string) {
    this.strokeSeq += 1;
    return `${strokeId}-${this.strokeSeq}`;
  }

  private pushRecentColor(color: string) {
    const normalized = color.toLowerCase();
    this.recentColors = [
      normalized,
      ...this.recentColors.filter((c) => c.toLowerCase() !== normalized),
    ].slice(0, 8);
  }

  private normalizeStroke(data: any, index: number): DrawItem {
    const id = typeof data?.id === 'string' ? data.id : `legacy-${index}-${Date.now()}`;
    const strokeId = typeof data?.strokeId === 'string' ? data.strokeId : id;
    const type = data?.type === 'shape' ? 'shape' : data?.type === 'fill' ? 'fill' : 'stroke';
    if (type === 'shape') {
      return {
        id,
        strokeId,
        userId: typeof data?.userId === 'number' ? data.userId : -1,
        type: 'shape',
        shapeType: data.shapeType ?? 'line',
        x1: data.x1,
        y1: data.y1,
        x2: data.x2,
        y2: data.y2,
        color: data.color ?? '#000000',
        fillColor: typeof data?.fillColor === 'string' ? data.fillColor : null,
        lineWidth: data.lineWidth ?? 2,
        tool: 'brush',
        layerId: typeof data?.layerId === 'string' ? data.layerId : this.activeLayerId,
      };
    }
    if (type === 'fill') {
      return {
        id,
        strokeId,
        userId: typeof data?.userId === 'number' ? data.userId : -1,
        type: 'fill',
        x: data.x,
        y: data.y,
        color: data.color ?? '#000000',
        tolerance: data.tolerance ?? 16,
        tool: 'fill',
        layerId: typeof data?.layerId === 'string' ? data.layerId : this.activeLayerId,
      };
    }
    return {
      id,
      strokeId,
      userId: typeof data?.userId === 'number' ? data.userId : -1,
      type: 'stroke',
      fromX: data.fromX,
      fromY: data.fromY,
      toX: data.toX,
      toY: data.toY,
      color: data.color ?? '#000000',
      lineWidth: data.lineWidth ?? 2,
      tool: (data.tool ?? 'brush') as Tool,
      layerId: typeof data?.layerId === 'string' ? data.layerId : this.activeLayerId,
    };
  }

  private shouldResync(version: number | undefined) {
    if (typeof version !== 'number') return false;
    if (version === this.boardVersion + 1) {
      this.boardVersion = version;
      return false;
    }
    if (version <= this.boardVersion) {
      return true;
    }
    this.requestResync();
    return true;
  }

  private requestResync() {
    this.resyncTrigger$.next();
  }

  private setupResyncPipeline() {
    this.resyncTrigger$
      .pipe(
        switchMap(() =>
          timer(0, 1200).pipe(
            take(3),
            tap(() => {
              this.socketService.emit('board:resync', { boardId: this.boardId });
            }),
            // Stop retries as soon as fresh board state arrives.
            takeUntil(this.boardStateArrived$),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  private setupAutosavePipeline() {
    const mutationEvents$ = merge(
      this.socketService.listen('draw'),
      this.socketService.listen('shape:update'),
      this.socketService.listen('shape:delete'),
      this.socketService.listen('undo'),
      this.socketService.listen('redo'),
      this.socketService.listen('clear'),
      this.socketService.listen('layers:update'),
    );

    mutationEvents$
      .pipe(
        debounceTime(700),
        filter(() => this.boardLoaded && this.boardId > 0),
        map(() => this.serializeBoardContent()),
        switchMap((content) =>
          this.boardService.updateBoardContent(this.boardId, content).pipe(
            retry(2),
            catchError(() => EMPTY),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  private serializeBoardContent() {
    return JSON.stringify({
      items: this.strokes,
      layers: this.layers,
      savedAt: Date.now(),
    });
  }

  private applyAlpha(color: string, alpha: number) {
    if (color.startsWith('hsl(')) {
      return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
    }
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
      // convert to rgba
      const hex = color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  private toolLabel(tool: Tool) {
    switch (tool) {
      case 'eraser':
        return 'E';
      case 'line':
        return 'L';
      case 'rect':
        return 'R';
      case 'circle':
        return 'C';
      case 'fill':
        return 'F';
      case 'select':
        return 'S';
      default:
        return 'B';
    }
  }

  private isShapeTool(tool: Tool) {
    return tool === 'line' || tool === 'rect' || tool === 'circle';
  }

  private createPreviewShape(
    tool: Tool,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): ShapeItem {
    const strokeId = this.activeStrokeId ?? 'preview';
    return {
      id: `${strokeId}-preview`,
      strokeId,
      userId: this.userId ?? -1,
      type: 'shape',
      shapeType: tool as 'line' | 'rect' | 'circle',
      x1,
      y1,
      x2,
      y2,
      color: this.currentColor,
      fillColor: null,
      lineWidth: this.lineWidth,
      tool: 'brush',
      layerId: this.activeLayerId,
    };
  }

  private createShapeItem(
    strokeId: string,
    shapeType: 'line' | 'rect' | 'circle',
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): ShapeItem {
    return {
      id: this.createSegmentId(strokeId),
      strokeId,
      userId: this.userId ?? -1,
      type: 'shape',
      shapeType,
      x1,
      y1,
      x2,
      y2,
      color: this.currentColor,
      fillColor: null,
      lineWidth: this.lineWidth,
      tool: 'brush',
      layerId: this.activeLayerId,
    };
  }

  private drawShape(
    ctx: CanvasRenderingContext2D,
    shape: ShapeItem,
    preview = false,
  ) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (preview) {
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([6, 4]);
    }

    if (shape.shapeType === 'line') {
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    } else if (shape.shapeType === 'rect') {
      const x = Math.min(shape.x1, shape.x2);
      const y = Math.min(shape.y1, shape.y2);
      const w = Math.abs(shape.x2 - shape.x1);
      const h = Math.abs(shape.y2 - shape.y1);
      if (preview) {
        ctx.strokeRect(x, y, w, h);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        if (shape.fillColor) {
          ctx.fillStyle = shape.fillColor;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
    } else {
      const cx = (shape.x1 + shape.x2) / 2;
      const cy = (shape.y1 + shape.y2) / 2;
      const rx = Math.abs(shape.x2 - shape.x1) / 2;
      const ry = Math.abs(shape.y2 - shape.y1) / 2;
      if (preview) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        if (shape.fillColor) {
          ctx.fillStyle = shape.fillColor;
          ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private drawSelectionOverlay() {
    if (!this.selectedShapeId) return;
    const shape =
      this.selectedShapePreview ??
      (this.strokes.find(
        (s) => s.type === 'shape' && s.id === this.selectedShapeId,
      ) as ShapeItem | undefined);
    if (!shape) return;
    if (!this.isLayerVisible(shape.layerId)) return;

    const bounds = this.getShapeBounds(shape);
    this.cursorCtx.save();
    this.cursorCtx.strokeStyle = '#1a73e8';
    this.cursorCtx.lineWidth = 1;
    this.cursorCtx.setLineDash([4, 3]);
    this.cursorCtx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    this.cursorCtx.setLineDash([]);
    for (const h of this.getResizeHandles(shape)) {
      this.cursorCtx.fillStyle = '#fff';
      this.cursorCtx.strokeStyle = '#1a73e8';
      this.cursorCtx.lineWidth = 1;
      this.cursorCtx.fillRect(h.x - 4, h.y - 4, 8, 8);
      this.cursorCtx.strokeRect(h.x - 4, h.y - 4, 8, 8);
    }
    this.cursorCtx.restore();
  }

  private drawBrushPreview() {
    if (this.lastCursorX === null || this.lastCursorY === null) return;
    if (this.currentTool !== 'brush' && this.currentTool !== 'eraser' && this.currentTool !== 'fill') return;
    const r = this.getEffectiveLineWidth(this.currentTool, this.lineWidth) / 2;
    this.cursorCtx.save();
    this.cursorCtx.beginPath();
    this.cursorCtx.arc(this.lastCursorX, this.lastCursorY, r, 0, Math.PI * 2);
    this.cursorCtx.lineWidth = 1;
    this.cursorCtx.strokeStyle =
      this.currentTool === 'eraser' ? 'rgba(120,0,0,0.8)' : 'rgba(0,0,0,0.6)';
    this.cursorCtx.stroke();
    if (this.currentTool === 'brush') {
      this.cursorCtx.fillStyle = this.applyAlpha(this.currentColor, 0.25);
      this.cursorCtx.fill();
    }
    this.cursorCtx.restore();
  }

  private getShapeBounds(shape: ShapeItem) {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    const w = Math.abs(shape.x2 - shape.x1);
    const h = Math.abs(shape.y2 - shape.y1);
    return { x, y, w, h };
  }

  private getResizeHandles(shape: ShapeItem): Array<{ x: number; y: number; handle: ResizeHandle }> {
    if (shape.shapeType === 'line') {
      return [
        { x: shape.x1, y: shape.y1, handle: 'line-start' },
        { x: shape.x2, y: shape.y2, handle: 'line-end' },
      ];
    }
    const b = this.getShapeBounds(shape);
    return [
      { x: b.x, y: b.y, handle: 'nw' },
      { x: b.x + b.w, y: b.y, handle: 'ne' },
      { x: b.x, y: b.y + b.h, handle: 'sw' },
      { x: b.x + b.w, y: b.y + b.h, handle: 'se' },
    ];
  }

  private hitTestShape(x: number, y: number): { shape: ShapeItem; handle: ResizeHandle | null } | null {
    const orderedLayers = [...this.layers];
    for (const layer of orderedLayers) {
      if (!layer.visible) continue;
      for (let i = this.strokes.length - 1; i >= 0; i -= 1) {
        const item = this.strokes[i];
        if (item.type !== 'shape') continue;
        const shape = item as ShapeItem;
        if (shape.layerId !== layer.id) continue;
        for (const h of this.getResizeHandles(shape)) {
          if (Math.abs(x - h.x) <= 6 && Math.abs(y - h.y) <= 6) {
            return { shape, handle: h.handle };
          }
        }
        if (this.isPointInShape(shape, x, y)) {
          return { shape, handle: null };
        }
      }
    }
    return null;
  }

  private hitTestShapeBody(x: number, y: number): ShapeItem | null {
    const orderedLayers = [...this.layers];
    for (const layer of orderedLayers) {
      if (!layer.visible) continue;
      for (let i = this.strokes.length - 1; i >= 0; i -= 1) {
        const item = this.strokes[i];
        if (item.type !== 'shape') continue;
        const shape = item as ShapeItem;
        if (shape.layerId !== layer.id) continue;
        if (this.isPointInShape(shape, x, y)) {
          return shape;
        }
      }
    }
    return null;
  }

  private isPointInShape(shape: ShapeItem, x: number, y: number) {
    if (shape.shapeType === 'line') {
      return this.distanceToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= 6;
    }
    const b = this.getShapeBounds(shape);
    if (shape.shapeType === 'rect') {
      return x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h;
    }
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    const rx = Math.abs(shape.x2 - shape.x1) / 2;
    const ry = Math.abs(shape.y2 - shape.y1) / 2;
    if (rx === 0 || ry === 0) return false;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  private distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const cx = x1 + clamped * dx;
    const cy = y1 + clamped * dy;
    return Math.hypot(px - cx, py - cy);
  }

  private applyResize(shape: ShapeItem, handle: ResizeHandle, x: number, y: number) {
    if (handle === 'line-start') {
      shape.x1 = x;
      shape.y1 = y;
      return;
    }
    if (handle === 'line-end') {
      shape.x2 = x;
      shape.y2 = y;
      return;
    }
    const leftIsX1 = shape.x1 <= shape.x2;
    const topIsY1 = shape.y1 <= shape.y2;
    const usesLeftX = handle === 'nw' || handle === 'sw';
    const usesTopY = handle === 'nw' || handle === 'ne';

    const moveX1 = usesLeftX ? leftIsX1 : !leftIsX1;
    const moveY1 = usesTopY ? topIsY1 : !topIsY1;

    if (moveX1) {
      shape.x1 = x;
    } else {
      shape.x2 = x;
    }
    if (moveY1) {
      shape.y1 = y;
    } else {
      shape.y2 = y;
    }
  }

  private getEffectiveLineWidth(tool: string, lineWidth: number) {
    if (tool !== 'eraser') {
      return lineWidth;
    }
    return Math.max(10, lineWidth * 2.5);
  }

  private getLiveShapePreview(): ShapeItem | null {
    if (!this.isShapeTool(this.currentTool)) return null;
    if (!this.drawing || !this.shapeStart) return null;
    if (this.lastCursorX === null || this.lastCursorY === null) return null;
    const adjusted = this.applyConstrain(
      this.currentTool,
      this.shapeStart.x,
      this.shapeStart.y,
      this.lastCursorX,
      this.lastCursorY,
    );
    return this.createPreviewShape(
      this.currentTool,
      this.shapeStart.x,
      this.shapeStart.y,
      adjusted.x2,
      adjusted.y2,
    );
  }

  private applyConstrain(
    tool: Tool,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) {
    if (!this.constrainShape) return { x2, y2 };
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (tool === 'rect' || tool === 'circle') {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      return {
        x2: x1 + Math.sign(dx || 1) * size,
        y2: y1 + Math.sign(dy || 1) * size,
      };
    }
    if (tool === 'line') {
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 4; // 45deg
      const snapped = Math.round(angle / step) * step;
      const len = Math.hypot(dx, dy);
      return {
        x2: x1 + Math.cos(snapped) * len,
        y2: y1 + Math.sin(snapped) * len,
      };
    }
    return { x2, y2 };
  }

  isLayerVisible(layerId: string) {
    const layer = this.layers.find((l) => l.id === layerId);
    return layer ? layer.visible : true;
  }

  isLayerLocked(layerId: string) {
    const layer = this.layers.find((l) => l.id === layerId);
    return layer ? layer.locked : false;
  }

  isBoardOwner() {
    return this.userId !== null && this.boardOwnerId === this.userId;
  }

  isLayerOwner(layer: Layer) {
    return this.userId !== null && layer.ownerId === this.userId;
  }

  canManageLayer(layer: Layer) {
    return this.isLayerOwner(layer) || this.isBoardOwner();
  }

  canDrawOnLayer(layerId: string) {
    const layer = this.layers.find((l) => l.id === layerId);
    if (!layer) return true;
    if (!layer.visible) return false;
    if (!layer.locked) return true;
    return this.userId !== null && layer.ownerId === this.userId;
  }

  getActiveLayer() {
    return this.layers.find((l) => l.id === this.activeLayerId) ?? null;
  }


  private cloneShape(shape: ShapeItem): ShapeItem {
    return { ...shape };
  }

  private getSelectedShape(): ShapeItem | null {
    if (!this.selectedShapeId) return null;
    if (this.selectedShapePreview && this.selectedShapePreview.id === this.selectedShapeId) {
      return this.cloneShape(this.selectedShapePreview);
    }
    const shape = this.strokes.find(
      (s) => s.type === 'shape' && s.id === this.selectedShapeId,
    ) as ShapeItem | undefined;
    return shape ? this.cloneShape(shape) : null;
  }

  private copySelectedShape() {
    const shape = this.getSelectedShape();
    if (!shape) return;
    this.shapeClipboard = shape;
  }

  private pasteShapeFromClipboard() {
    if (!this.userId || !this.shapeClipboard) return;
    const layerId = this.canDrawOnLayer(this.activeLayerId)
      ? this.activeLayerId
      : (this.canDrawOnLayer(this.shapeClipboard.layerId) ? this.shapeClipboard.layerId : null);
    if (!layerId) return;
    const strokeId = this.createStrokeId();
    const pasted = this.cloneShape(this.shapeClipboard);
    pasted.strokeId = strokeId;
    pasted.id = this.createSegmentId(strokeId);
    pasted.userId = this.userId;
    pasted.layerId = layerId;
    pasted.x1 += 20;
    pasted.y1 += 20;
    pasted.x2 += 20;
    pasted.y2 += 20;

    this.strokes.push(pasted);
    this.undoStack.push([pasted]);
    this.redoStack = [];
    this.selectedShapeId = pasted.id;
    this.selectedShapeOriginal = this.cloneShape(pasted);
    this.selectedShapePreview = this.cloneShape(pasted);
    this.selectionDirty = false;
    this.dirtyLayers.add(pasted.layerId);
    this.requestRedraw();
    this.socketService.emit('draw', {
      ...pasted,
    });
    this.boardVersion += 1;
  }

  private deleteSelectedShape() {
    if (!this.userId || !this.selectedShapeId) return;
    const idx = this.strokes.findIndex(
      (s) => s.type === 'shape' && s.id === this.selectedShapeId,
    );
    if (idx < 0) return;
    const shape = this.strokes[idx] as ShapeItem;
    this.strokes.splice(idx, 1);
    this.undoStack.push([
      {
        type: 'delete',
        item: this.cloneShape(shape),
        index: idx,
      },
    ]);
    this.redoStack = [];
    this.dirtyLayers.add(shape.layerId);
    this.requestRedraw();
    this.socketService.emit('shape:delete', {
      id: shape.id,
    });
    this.boardVersion += 1;
    this.selectedShapeId = null;
    this.selectedShapeOriginal = null;
    this.selectedShapePreview = null;
    this.selectionDirty = false;
  }

  private applyFillOnContext(
    ctx: CanvasRenderingContext2D,
    fill: FillItem,
    width: number,
    height: number,
  ) {
    const img = ctx.getImageData(0, 0, width, height);
    const { data, width: w, height: h } = img;

    const startX = Math.floor(fill.x);
    const startY = Math.floor(fill.y);
    if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;

    const startIdx = (startY * width + startX) * 4;
    const target: [number, number, number, number] = [
      data[startIdx],
      data[startIdx + 1],
      data[startIdx + 2],
      data[startIdx + 3],
    ];

    const fillColor = this.hexToRgba(fill.color);
    if (!fillColor) return;

    if (this.colorMatch(target, fillColor, fill.tolerance)) return;

    const stack: Array<[number, number]> = [[startX, startY]];
    const visited = new Uint8Array(w * h);
    const tol = fill.tolerance;

    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const idx = y * w + x;
      if (visited[idx]) continue;
      visited[idx] = 1;

      const off = idx * 4;
      const current: [number, number, number, number] = [
        data[off],
        data[off + 1],
        data[off + 2],
        data[off + 3],
      ];

      if (!this.colorMatch(current, target, tol)) continue;

      data[off] = fillColor[0];
      data[off + 1] = fillColor[1];
      data[off + 2] = fillColor[2];
      data[off + 3] = fillColor[3];

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }

    this.expandFillEdges(data, w, h, fillColor, tol);
    ctx.putImageData(img, 0, 0);
  }

  private expandFillEdges(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    fillColor: [number, number, number, number],
    tolerance: number,
  ) {
    const [fr, fg, fb] = fillColor;
    const edgeAlphaMax = Math.min(200, Math.max(48, tolerance * 4));
    const copy = new Uint8ClampedArray(data);
    const isFillAt = (off: number) =>
      copy[off] === fr && copy[off + 1] === fg && copy[off + 2] === fb && copy[off + 3] === 255;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const off = (y * width + x) * 4;
        const alpha = copy[off + 3];
        if (alpha === 0) continue;
        if (alpha > edgeAlphaMax) continue;
        if (isFillAt(off)) continue;

        const left = off - 4;
        const right = off + 4;
        const up = off - width * 4;
        const down = off + width * 4;
        if (isFillAt(left) || isFillAt(right) || isFillAt(up) || isFillAt(down)) {
          data[off] = fr;
          data[off + 1] = fg;
          data[off + 2] = fb;
          // Keep original alpha to preserve smooth edges.
          data[off + 3] = alpha;
        }
      }
    }
  }

  private hexToRgba(color: string): [number, number, number, number] | null {
    if (!color.startsWith('#')) return null;
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 255];
  }

  private colorMatch(
    a: [number, number, number, number],
    b: [number, number, number, number],
    tolerance: number,
  ) {
    const dr = Math.abs(a[0] - b[0]);
    const dg = Math.abs(a[1] - b[1]);
    const db = Math.abs(a[2] - b[2]);
    const da = Math.abs(a[3] - b[3]);
    return (
      dr <= tolerance &&
      dg <= tolerance &&
      db <= tolerance &&
      da <= tolerance
    );
  }
}

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill' | 'select';

interface StrokeItem {
  id: string;
  strokeId: string;
  userId: number;
  type: 'stroke';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
  tool: Tool;
  layerId: string;
}

interface ShapeItem {
  id: string;
  strokeId: string;
  userId: number;
  type: 'shape';
  shapeType: 'line' | 'rect' | 'circle';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  fillColor: string | null;
  lineWidth: number;
  tool: 'brush';
  layerId: string;
}

interface FillItem {
  id: string;
  strokeId: string;
  userId: number;
  type: 'fill';
  x: number;
  y: number;
  color: string;
  tolerance: number;
  tool: 'fill';
  layerId: string;
}

type DrawItem = StrokeItem | ShapeItem | FillItem;

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  ownerId: number;
  locked: boolean;
}

interface ShapeUpdateAction {
  type: 'update';
  targetId: string;
  before: ShapeItem;
  after: ShapeItem;
}

interface ShapeDeleteAction {
  type: 'delete';
  item: ShapeItem;
  index: number;
}

type DrawAction = DrawItem | ShapeUpdateAction | ShapeDeleteAction;

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'line-start' | 'line-end';
