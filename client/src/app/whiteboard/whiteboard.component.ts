import { Component, ElementRef, ViewChild, AfterViewInit, HostListener} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-whiteboard',
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
    this.ctx.lineCap = 'round';

    // Listen for drawing + clearing events
    this.socketService.listen('draw').subscribe((data) => this.drawFromServer(data));
    this.socketService.listen('clear').subscribe(() => this.clearLocal());
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    this.drawing = true;
    const { offsetX, offsetY } = event;
    this.ctx.beginPath();
    this.ctx.moveTo(offsetX, offsetY);
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;

    this.socketService.emit('draw', {
      type: 'begin',
      x: offsetX,
      y: offsetY,
      color: this.currentColor,
      lineWidth: this.lineWidth,
    });
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.drawing) return;
    const { offsetX, offsetY } = event;
    this.ctx.lineTo(offsetX, offsetY);
    this.ctx.stroke();

    this.socketService.emit('draw', {
      type: 'draw',
      x: offsetX,
      y: offsetY,
      color: this.currentColor,
      lineWidth: this.lineWidth,
    });
  }

  @HostListener('mouseup')
  @HostListener('mouseleave')
  stopDrawing() {
    this.drawing = false;
  }

  drawFromServer(data: any) {
    if (!this.ctx) return;

    this.ctx.strokeStyle = data.color || '#000000';
    this.ctx.lineWidth = data.lineWidth || 2;

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