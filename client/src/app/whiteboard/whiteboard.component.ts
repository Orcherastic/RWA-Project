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
  private strokes: Stroke[] = [];
  undoStack: Stroke[][] = [];
  redoStack: Stroke[][] = [];
  private userId: number | null = null;
  private strokeSeq = 0;

  currentColor = '#000000';
  lineWidth = 2;
  currentTool: 'brush' | 'eraser' = 'brush';

  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastCursorX: number | null = null;
  private lastCursorY: number | null = null;
  private activeStrokeId: string | null = null;
  private activeStrokeBuffer: Stroke[] = [];

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
      this.socketService.listen('board:state').subscribe(({ strokes }) => {
        this.strokes = Array.isArray(strokes)
          ? strokes.map((s, idx) => this.normalizeStroke(s, idx))
          : [];
        this.undoStack = [];
        this.redoStack = [];
        this.boardLoaded = true;
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
            (tool ?? 'brush') as 'brush' | 'eraser',
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
    this.socketService.listen('undo').subscribe(({ strokeId }) => {
      if (!strokeId) return;
      const before = this.strokes.length;
      this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
      if (this.strokes.length !== before) {
        this.redrawAll();
      }
    });
    this.socketService.listen('clear').subscribe(() => {
      this.clearLocal();
      this.strokes = [];
      this.undoStack = [];
      this.redoStack = [];
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
    this.socketService.emit('cursor:leave', {
      boardId: this.boardId,
    });
    this.cursorService.clear();
  }

  private redrawAll() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of this.strokes) {
      this.applyStrokeStyle(stroke);
      this.ctx.beginPath();
      this.ctx.moveTo(stroke.fromX, stroke.fromY);
      this.ctx.lineTo(stroke.toX, stroke.toY);
      this.ctx.stroke();
      this.resetComposite();
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

      this.cursorService.all().forEach(({ x, y, color, displayName, tool }) => {
        this.cursorCtx.beginPath();
        this.cursorCtx.arc(x, y, 4, 0, Math.PI * 2);
        this.cursorCtx.fillStyle = color;
        this.cursorCtx.fill();

        const label = `${displayName} [${tool === 'eraser' ? 'E' : 'B'}]`;
        this.cursorCtx.font = '12px Arial';
        this.cursorCtx.fillStyle = color;
        this.cursorCtx.fillText(label, x + 8, y - 8);
      });

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

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    if (!this.boardLoaded) return;
    const { x, y, inside } = this.getCanvasCoords(event);
    if (!inside) return;

    this.drawing = true;
    this.lastX = x;
    this.lastY = y;
    this.activeStrokeId = this.createStrokeId();
    this.activeStrokeBuffer = [];

    this.applyStrokeStyle({
      color: this.currentColor,
      lineWidth: this.lineWidth,
      tool: this.currentTool,
    });
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.drawing || this.lastX === null || this.lastY === null) return;

    const { x, y, inside } = this.getCanvasCoords(event);
    if (!inside) {
      this.drawing = false;
      this.lastX = this.lastY = null;
      if (this.activeStrokeBuffer.length > 0) {
        this.undoStack.push(this.activeStrokeBuffer);
        this.activeStrokeBuffer = [];
        this.activeStrokeId = null;
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
    const stroke: Stroke = {
      id: segmentId,
      strokeId,
      userId: strokeUserId,
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

  @HostListener('mouseup')
  @HostListener('mouseleave')
  stopDrawing() {
    if (this.drawing) {
      this.drawing = false;
      this.lastX = this.lastY = null;
      if (this.activeStrokeBuffer.length > 0) {
        this.undoStack.push(this.activeStrokeBuffer);
        this.activeStrokeBuffer = [];
        this.activeStrokeId = null;
      }
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
    }
  }

  drawFromServer(data: any) {
    if (!this.ctx) return;

    if (data.type === 'stroke') {
      this.applyStrokeStyle(data);
      this.ctx.beginPath();
      this.ctx.moveTo(data.fromX, data.fromY);
      this.ctx.lineTo(data.toX, data.toY);
      this.ctx.stroke();
      this.resetComposite();

      // STORE REMOTE STROKE
      this.strokes.push(this.normalizeStroke(data, this.strokes.length));
    }
  }

  clearBoard() {
    this.clearLocal();
    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.socketService.emit('clear', {});
  }

  clearLocal() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  setTool(tool: 'brush' | 'eraser') {
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

  undo() {
    if (!this.userId || this.undoStack.length === 0) return;
    const group = this.undoStack.pop()!;
    this.redoStack.push(group);
    const strokeId = group[0]?.strokeId;
    if (!strokeId) return;
    this.strokes = this.strokes.filter((s) => s.strokeId !== strokeId);
    this.redrawAll();
    this.socketService.emit('undo', { boardId: this.boardId, strokeId });
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

  private normalizeStroke(data: any, index: number): Stroke {
    const id = typeof data?.id === 'string' ? data.id : `legacy-${index}-${Date.now()}`;
    const strokeId = typeof data?.strokeId === 'string' ? data.strokeId : id;
    return {
      id,
      strokeId,
      userId: typeof data?.userId === 'number' ? data.userId : -1,
      fromX: data.fromX,
      fromY: data.fromY,
      toX: data.toX,
      toY: data.toY,
      color: data.color ?? '#000000',
      lineWidth: data.lineWidth ?? 2,
      tool: (data.tool ?? 'brush') as 'brush' | 'eraser',
    };
  }
}

interface Stroke {
  id: string;
  strokeId: string;
  userId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
  tool: 'brush' | 'eraser';
}
