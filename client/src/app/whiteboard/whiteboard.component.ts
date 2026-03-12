import { Component, ElementRef, ViewChild, AfterViewInit, HostListener, OnInit,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { fromEvent, throttleTime } from 'rxjs';
import { CursorService } from '../services/cursor.service';

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
  private strokes: any[] = [];

  currentColor = '#000000';
  lineWidth = 2;
  currentTool: 'brush' | 'eraser' = 'brush';

  private lastX: number | null = null;
  private lastY: number | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly socketService: SocketService,
    private readonly cursorService: CursorService
  ) {}
  
  ngOnInit() {
    this.boardId = Number(this.route.snapshot.paramMap.get('id'));
    this.subscriptions.push(
      this.socketService.listen('board:state').subscribe(({ strokes }) => {
        this.strokes = Array.isArray(strokes) ? strokes : [];
        this.boardLoaded = true;
        this.redrawAll();
      })
    );

    this.subscriptions.push(
      this.socketService.listen('cursor:update').subscribe(({ userId, x, y }) => {
        this.cursorService.set(userId, x, y);
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
    this.socketService.listen('clear').subscribe(() => {
      this.clearLocal();
      this.strokes = [];
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

      this.socketService.emit('cursor:move', {
        boardId: this.boardId,
        x,
        y,
      });
    });

    fromEvent<MouseEvent>(canvas, 'mouseleave').subscribe(() => {
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

      this.cursorService.all().forEach(({ x, y }) => {
        this.cursorCtx.beginPath();
        this.cursorCtx.arc(x, y, 4, 0, Math.PI * 2);
        this.cursorCtx.fillStyle = 'red';
        this.cursorCtx.fill();
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
      return;
    }

    const fromX = this.lastX;
    const fromY = this.lastY;

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
    this.strokes.push({
      fromX,
      fromY,
      toX: x,
      toY: y,
      color: this.currentColor,
      lineWidth: this.lineWidth,
      tool: this.currentTool,
    });

    // Update last position
    this.lastX = x;
    this.lastY = y;

    // Emit for others
    this.socketService.emit('draw', {
      type: 'stroke',
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
      this.strokes.push({
        fromX: data.fromX,
        fromY: data.fromY,
        toX: data.toX,
        toY: data.toY,
        color: data.color,
        lineWidth: data.lineWidth,
        tool: data.tool,
      });
    }
  }

  clearBoard() {
    this.clearLocal();
    this.strokes = [];
    this.socketService.emit('clear', {});
  }

  clearLocal() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  setTool(tool: 'brush' | 'eraser') {
    this.currentTool = tool;
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
}
