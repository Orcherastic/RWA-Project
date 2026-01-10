import { Component, ElementRef, ViewChild, AfterViewInit, HostListener, OnInit,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { BoardService } from '../services/board.service';
import { debounceTime, fromEvent, Subject, throttleTime } from 'rxjs';
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
  private readonly saveSubject = new Subject<void>();
  private readonly subscriptions: any[] = [];
  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private boardLoaded = false;
  boardId!: number;
  private strokes: any[] = [];

  currentColor = '#000000';
  lineWidth = 2;

  private lastX: number | null = null;
  private lastY: number | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly socketService: SocketService,
    private readonly boardService: BoardService,
    private readonly cursorService: CursorService
  ) {}
  
  ngOnInit() {
    this.boardId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadBoardContent();
    this.subscriptions.push(
      this.saveSubject.pipe(debounceTime(1000)).subscribe(() => this.saveBoardContent())
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
    );
  }

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.boardId = Number(this.route.snapshot.paramMap.get('id'));

    this.socketService.emit('joinBoard', this.boardId);

    this.socketService.listen('draw').subscribe((data) => this.drawFromServer(data));
    this.socketService.listen('clear').subscribe(() => this.clearLocal());

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
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.cursorService.clear();
  }

  private loadBoardContent() {
    this.boardService.getBoardById(this.boardId).subscribe({
      next: (board) => {
        this.boardLoaded = true;
        if (board.content) {
          try {
            this.strokes = JSON.parse(board.content);
            this.redrawAll();
          } catch {
            console.error('Invalid board content format');
          }
        }
      },
      error: (err) => 
        {
          this.boardLoaded = false;
          console.error('Error loading board:', err)
        }
    });
  }

  private saveBoardContent() {
    if (!this.boardLoaded) return;

    this.boardService
      .updateBoardContent(this.boardId, JSON.stringify(this.strokes))
      .subscribe({
        error: (err) => console.error('Error saving board content:', err),
      });
  }

  private redrawAll() {
    for (const stroke of this.strokes) {
      this.ctx.strokeStyle = stroke.color;
      this.ctx.lineWidth = stroke.lineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(stroke.fromX, stroke.fromY);
      this.ctx.lineTo(stroke.toX, stroke.toY);
      this.ctx.stroke();
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
    const { x, y, inside } = this.getCanvasCoords(event);
    if (!inside) return;

    this.drawing = true;
    this.lastX = x;
    this.lastY = y;

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;

    this.socketService.emit('draw', {
      type: 'begin',
      x,
      y,
      color: this.currentColor,
      lineWidth: this.lineWidth,
    });
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

    // Draw locally
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    // Save stroke for persistence
    this.strokes.push({
      fromX: this.lastX,
      fromY: this.lastY,
      toX: x,
      toY: y,
      color: this.currentColor,
      lineWidth: this.lineWidth,
    });

    // Update last position
    this.lastX = x;
    this.lastY = y;

    // Emit for others
    this.socketService.emit('draw', {
      type: 'draw',
      x,
      y,
      color: this.currentColor,
      lineWidth: this.lineWidth,
    });

    // Debounced save trigger
    if (this.boardLoaded) {
      this.saveSubject.next();
    }
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
      if (this.boardLoaded) {
        this.saveSubject.next();
      }
    }
  }

  drawFromServer(data: any) {
    if (!this.ctx) return;
    // ensure styling is applied from the remote data
    if (data.color) this.ctx.strokeStyle = data.color;
    if (data.lineWidth) this.ctx.lineWidth = data.lineWidth;

    if (data.type === 'begin') {
      this.ctx.beginPath();
      this.ctx.moveTo(data.x, data.y);
    } else if (data.type === 'draw') {
      this.ctx.lineTo(data.x, data.y);
      this.ctx.stroke();
    }
  }

  clearBoard() {
    this.clearLocal();
    this.strokes = [];
    if (this.boardLoaded) {
      this.saveSubject.next();
    }
    this.socketService.emit('clear', {});
  }

  clearLocal() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}