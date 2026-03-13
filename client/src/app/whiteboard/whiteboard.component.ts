import { Component, ElementRef, ViewChild, AfterViewInit, HostListener, OnInit,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { fromEvent, throttleTime } from 'rxjs';
import { CursorService } from '../services/cursor.service';
import { AuthService } from '../auth/auth.service';

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

  private cursorCtx!: CanvasRenderingContext2D;
  private readonly subscriptions: any[] = [];
  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private boardLoaded = false;
  boardId!: number;
  private strokes: DrawItem[] = [];
  undoStack: DrawItem[][] = [];
  redoStack: DrawItem[][] = [];
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

  constructor(
    private readonly route: ActivatedRoute,
    private readonly socketService: SocketService,
    private readonly cursorService: CursorService,
    private readonly authService: AuthService
  ) {}
  
  ngOnInit() {
    this.boardId = Number(this.route.snapshot.paramMap.get('id'));
    this.userId = this.authService.getUserId();
    this.subscriptions.push(
      this.socketService.listen('board:state').subscribe(({ strokes, version }) => {
        this.strokes = Array.isArray(strokes)
          ? strokes.map((s, idx) => this.normalizeStroke(s, idx))
          : [];
        this.undoStack = [];
        this.redoStack = [];
        this.boardLoaded = true;
        this.boardVersion = typeof version === 'number' ? version : 0;
        this.redrawAll();
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

    this.socketService.emit('joinBoard', this.boardId);

    this.socketService.listen('draw').subscribe((data) => this.drawFromServer(data));
    this.socketService.listen('undo').subscribe(({ strokeId, version }) => {
      if (this.shouldResync(version)) return;
      if (!strokeId) return;
      const before = this.strokes.length;
      this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
      if (this.strokes.length !== before) {
        this.redrawAll();
      }
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
    this.socketService.listen('presence:update').subscribe(({ users }) => {
      this.presenceUsers = Array.isArray(users) ? users : [];
    });

    const cursor = this.cursorCanvasRef.nativeElement;
    this.cursorCtx = cursor.getContext('2d')!;
    this.startCursorRenderLoop();

    fromEvent<MouseEvent>(canvas, 'mousemove')
    .pipe(throttleTime(33)) // ~30fps
    .subscribe(event => {
      if (!this.boardLoaded) return;
      const { x, y, inside } = this.getCanvasCoords(event);
      if (!inside) return;
      this.lastCursorX = x;
      this.lastCursorY = y;

      this.socketService.emit('cursor:move', {
        boardId: this.boardId,
        x,
        y,
        tool: this.currentTool,
      });
    });

    fromEvent<MouseEvent>(canvas, 'mouseleave').subscribe(() => {
      this.lastCursorX = null;
      this.lastCursorY = null;
      this.socketService.emit('cursor:leave', {
        boardId: this.boardId,
      });
    });

  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.socketService.emit('leaveBoard', {});
    this.socketService.emit('cursor:leave', {
      boardId: this.boardId,
    });
    this.cursorService.clear();
  }

  private redrawAll() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of this.strokes) {
      if (stroke.type === 'stroke') {
        this.applyStrokeStyle(stroke);
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.fromX, stroke.fromY);
        this.ctx.lineTo(stroke.toX, stroke.toY);
        this.ctx.stroke();
        this.resetComposite();
      } else if (stroke.type === 'shape') {
        this.drawShape(this.ctx, stroke);
      } else {
        this.applyFill(stroke);
      }
    }
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
    const { x, y, inside } = this.getCanvasCoords(event);
    if (!inside) return;

    this.drawing = true;
    this.lastX = x;
    this.lastY = y;
    this.activeStrokeId = this.createStrokeId();
    this.activeStrokeBuffer = [];

    if (this.currentTool === 'fill') {
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
      };
      this.applyFill(fillItem);
      this.strokes.push(fillItem);
      this.undoStack.push([fillItem]);
      this.redoStack = [];
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

    this.applyStrokeStyle({
      color: this.currentColor,
      lineWidth: this.lineWidth,
      tool: this.currentTool,
    });
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  onMouseMove(event: MouseEvent) {
    if (!this.drawing || this.lastX === null || this.lastY === null) return;

    const { x, y, inside } = this.getCanvasCoords(event);
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
        this.previewShape = this.createPreviewShape(
          this.currentTool,
          this.shapeStart.x,
          this.shapeStart.y,
          x,
          y,
        );
      }
      return;
    }

    const fromX = this.lastX;
    const fromY = this.lastY;
    const strokeId = this.activeStrokeId ?? this.createStrokeId();
    const segmentId = this.createSegmentId(strokeId);
    const strokeUserId = this.userId ?? -1;

    // Draw locally
    this.applyStrokeStyle({
      color: this.currentColor,
      lineWidth: this.lineWidth,
      tool: this.currentTool,
    });
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.resetComposite();

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
    };
    this.strokes.push(stroke);
    if (this.userId !== null) {
      this.activeStrokeBuffer.push(stroke);
      this.redoStack = [];
    }

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
        this.drawShape(this.ctx, shapeItem);
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
        });
        this.boardVersion += 1;
      }
      this.shapeStart = null;
      this.previewShape = null;
      this.activeStrokeId = null;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;

    const key = event.key.toLowerCase();
    const ctrlOrMeta = event.ctrlKey || event.metaKey;

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

    if (key === 'b') {
      event.preventDefault();
      this.setTool('brush');
      return;
    }

    if (key === 'e') {
      event.preventDefault();
      this.setTool('eraser');
      return;
    }

    if (key === 'f') {
      event.preventDefault();
      this.setTool('fill');
      return;
    }

    if (key === 'l') {
      event.preventDefault();
      this.setTool('line');
      return;
    }

    if (key === 'r') {
      event.preventDefault();
      this.setTool('rect');
      return;
    }

    if (key === 'c') {
      event.preventDefault();
      this.setTool('circle');
    }
  }

  drawFromServer(data: any) {
    if (!this.ctx) return;

    if (data.type === 'stroke') {
      if (this.shouldResync(data.version)) return;
      this.applyStrokeStyle(data);
      this.ctx.beginPath();
      this.ctx.moveTo(data.fromX, data.fromY);
      this.ctx.lineTo(data.toX, data.toY);
      this.ctx.stroke();
      this.resetComposite();

      // STORE REMOTE STROKE
      this.strokes.push(this.normalizeStroke(data, this.strokes.length));
    }
    if (data.type === 'shape') {
      if (this.shouldResync(data.version)) return;
      const shape = this.normalizeStroke(data, this.strokes.length) as ShapeItem;
      this.drawShape(this.ctx, shape);
      this.strokes.push(shape);
    }
    if (data.type === 'fill') {
      if (this.shouldResync(data.version)) return;
      const fill = this.normalizeStroke(data, this.strokes.length) as FillItem;
      this.applyFill(fill);
      this.strokes.push(fill);
    }
  }

  clearBoard() {
    this.socketService.emit('clear', {});
  }

  clearLocal() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  setTool(tool: Tool) {
    this.currentTool = tool;
    if (this.lastCursorX !== null && this.lastCursorY !== null) {
      this.socketService.emit('cursor:move', {
        boardId: this.boardId,
        x: this.lastCursorX,
        y: this.lastCursorY,
        tool: this.currentTool,
      });
    }
  }

  setColor(color: string) {
    this.currentColor = color;
    this.pushRecentColor(color);
  }

  onColorInput(value: string) {
    this.setColor(value);
  }

  undo() {
    if (!this.userId || this.undoStack.length === 0) return;
    const group = this.undoStack.pop()!;
    this.redoStack.push(group);
    const strokeId = group[0]?.strokeId;
    if (!strokeId) return;
    this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
    this.redrawAll();
    this.socketService.emit('undo', { boardId: this.boardId, strokeId });
    this.boardVersion += 1;
  }

  redo() {
    if (!this.userId || this.redoStack.length === 0) return;
    const group = this.redoStack.pop()!;
    this.undoStack.push(group);
    this.strokes.push(...group);
    this.redrawAll();
    const strokeId = group[0]?.strokeId;
    if (!strokeId) return;
    this.socketService.emit('redo', { boardId: this.boardId, strokeId, strokes: group });
    this.boardVersion += 1;
  }

  hasApprovedClear() {
    const uid = this.userId ?? -1;
    return !!this.clearStatus?.approvers?.includes(uid);
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
    this.ctx.lineWidth = stroke.lineWidth ?? this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private resetComposite() {
    this.ctx.globalCompositeOperation = 'source-over';
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
        lineWidth: data.lineWidth ?? 2,
        tool: 'brush',
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
    this.socketService.emit('board:resync', { boardId: this.boardId });
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
      lineWidth: this.lineWidth,
      tool: 'brush',
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
      lineWidth: this.lineWidth,
      tool: 'brush',
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
      ctx.strokeRect(x, y, w, h);
    } else {
      const cx = (shape.x1 + shape.x2) / 2;
      const cy = (shape.y1 + shape.y2) / 2;
      const rx = Math.abs(shape.x2 - shape.x1) / 2;
      const ry = Math.abs(shape.y2 - shape.y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private applyFill(fill: FillItem) {
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = img;

    const startX = Math.floor(fill.x);
    const startY = Math.floor(fill.y);
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

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
    const visited = new Uint8Array(width * height);
    const tol = fill.tolerance;

    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const idx = y * width + x;
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

    ctx.putImageData(img, 0, 0);
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
    return (
      Math.abs(a[0] - b[0]) <= tolerance &&
      Math.abs(a[1] - b[1]) <= tolerance &&
      Math.abs(a[2] - b[2]) <= tolerance &&
      Math.abs(a[3] - b[3]) <= tolerance
    );
  }
}

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill';

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
  lineWidth: number;
  tool: 'brush';
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
}

type DrawItem = StrokeItem | ShapeItem | FillItem;
