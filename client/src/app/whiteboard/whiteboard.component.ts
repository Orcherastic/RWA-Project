import { Component, ElementRef, ViewChild, AfterViewInit, HostListener} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-whiteboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whiteboard.component.html',
  styleUrls: ['./whiteboard.component.scss'],
})
export class WhiteboardComponent implements AfterViewInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  boardId!: number;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly socketService: SocketService
  ) {}

  currentColor = '#000000';
  lineWidth = 2;

  // ngOnInit() {
  //     this.boardId = Number(this.route.snapshot.paramMap.get('id'));
  //   //   this.boardService.getBoard(this.boardId).subscribe(board => {
  //   //   this.boardTitle = board.title;
  //   // });
  // }

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    if (!this.ctx) throw new Error('Canvas 2D context not available');

    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;

    this.socketService.listen('draw').subscribe((data: any) => this.drawFromServer(data));
    this.socketService.listen('clear').subscribe(() => this.clearLocal());
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

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);

    // set current stroke style before emitting
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;

    // emit begin event
    this.socketService.emit('draw', {
      type: 'begin',
      x,
      y,
      color: this.currentColor,
      lineWidth: this.lineWidth
    });
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.drawing) return;

    const { x, y, inside } = this.getCanvasCoords(event);
    if (!inside) {
      // If pointer left canvas while dragging, stop drawing to avoid stray lines
      // (optional: you might want to set drawing=false only on mouseup or mouseleave)
      this.drawing = false;
      return;
    }

    // draw locally
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    // emit draw event for others
    this.socketService.emit('draw', {
      type: 'draw',
      x,
      y,
      color: this.currentColor,
      lineWidth: this.lineWidth
    });
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
    this.drawing = false;
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
    this.socketService.emit('clear', {});
  }

  clearLocal() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}