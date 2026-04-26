import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-board-item',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board-item.component.html',
  styleUrls: ['./board-item.component.scss'],
})
export class BoardItemComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) board!: any;
  @Input() currentUserId: number | null = null;

  @Output() open = new EventEmitter<number>();
  @Output() share = new EventEmitter<any>();
  @Output() rename = new EventEmitter<{ board: any; title: string }>();
  @Output() remove = new EventEmitter<any>();
  @Output() disconnect = new EventEmitter<any>();

  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  isEditing = false;
  titleDraft = '';
  previewEmpty = true;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get ownerId() {
    return this.board?.ownerId ?? this.board?.owner?.id ?? null;
  }

  get isOwner() {
    return this.currentUserId !== null && this.ownerId === this.currentUserId;
  }

  get isShared() {
    return this.ownerId !== null && this.currentUserId !== null && !this.isOwner;
  }

  get ownerLabel() {
    const owner = this.board?.owner;
    if (!owner) return 'Unknown';
    return owner.displayName || owner.email || `User ${owner.id}`;
  }

  onOpen() {
    this.open.emit(this.board.id);
  }

  onShare() {
    if (!this.isOwner) return;
    this.share.emit(this.board);
  }

  ngAfterViewInit() {
    this.syncTitleDraft();
    this.renderPreview();
    this.cdr.detectChanges();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['board']) {
      if (!this.isEditing) {
        this.syncTitleDraft();
      }
      this.renderPreview();
    }
  }

  startRename() {
    if (!this.isOwner) return;
    this.isEditing = true;
    this.syncTitleDraft();
  }

  cancelRename() {
    this.isEditing = false;
    this.syncTitleDraft();
  }

  commitRename() {
    if (!this.isOwner) return;
    const next = this.titleDraft.trim();
    if (!next) return;
    this.rename.emit({ board: this.board, title: next });
    this.isEditing = false;
  }

  onRename() {
    if (this.isEditing) {
      this.commitRename();
      return;
    }
    this.startRename();
  }

  onDelete() {
    this.remove.emit(this.board);
  }

  onDisconnect() {
    this.disconnect.emit(this.board);
  }

  onTitleInput(event: Event) {
    const target = event.target as HTMLInputElement | null;
    this.titleDraft = target?.value ?? '';
  }

  onTitleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRename();
    }
  }

  private syncTitleDraft() {
    this.titleDraft = this.board?.title ?? '';
  }

  private renderPreview() {
    const canvas = this.previewCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
    const targetHeight = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const content = this.parseContent(this.board?.content);
    const items = content?.items ?? [];
    const layers = Array.isArray(content?.layers) ? content.layers : [];
    const visibleLayers = new Set(
      layers
        .filter((layer: any) => layer?.visible !== false)
        .map((layer: any) => layer?.id),
    );
    const filtered = items.filter((item: any) => {
      if (!visibleLayers.size) return true;
      return visibleLayers.has(item?.layerId);
    });

    const width = canvas.width || 240;
    const height = canvas.height || 140;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (!filtered.length) {
      this.previewEmpty = true;
      return;
    }

    const bounds = this.getBounds(filtered);
    if (!bounds) {
      this.previewEmpty = true;
      return;
    }
    this.previewEmpty = false;

    const padding = 12;
    const drawWidth = Math.max(1, width - padding * 2);
    const drawHeight = Math.max(1, height - padding * 2);
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(drawWidth / contentWidth, drawHeight / contentHeight);
    const offsetX =
      padding + (drawWidth - contentWidth * scale) / 2 - bounds.minX * scale;
    const offsetY =
      padding + (drawHeight - contentHeight * scale) / 2 - bounds.minY * scale;

    for (const item of filtered) {
      this.drawItem(ctx, item, scale, offsetX, offsetY);
    }
  }

  private parseContent(content: any) {
    if (!content) return null;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    if (typeof content === 'object') return content;
    return null;
  }

  private getBounds(items: any[]) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const item of items) {
      if (item?.type === 'stroke') {
        minX = Math.min(minX, item.fromX, item.toX);
        minY = Math.min(minY, item.fromY, item.toY);
        maxX = Math.max(maxX, item.fromX, item.toX);
        maxY = Math.max(maxY, item.fromY, item.toY);
      } else if (item?.type === 'shape') {
        minX = Math.min(minX, item.x1, item.x2);
        minY = Math.min(minY, item.y1, item.y2);
        maxX = Math.max(maxX, item.x1, item.x2);
        maxY = Math.max(maxY, item.y1, item.y2);
      } else if (item?.type === 'fill') {
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x);
        maxY = Math.max(maxY, item.y);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return { minX, minY, maxX, maxY };
  }

  private drawItem(
    ctx: CanvasRenderingContext2D,
    item: any,
    scale: number,
    offsetX: number,
    offsetY: number,
  ) {
    if (item?.type === 'stroke') {
      const tool = item.tool ?? 'brush';
      ctx.save();
      ctx.globalCompositeOperation =
        tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = item.color ?? '#000000';
      ctx.lineWidth = Math.max(0.5, (item.lineWidth ?? 2) * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(item.fromX * scale + offsetX, item.fromY * scale + offsetY);
      ctx.lineTo(item.toX * scale + offsetX, item.toY * scale + offsetY);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (item?.type === 'shape') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = item.color ?? '#000000';
      ctx.lineWidth = Math.max(0.5, (item.lineWidth ?? 2) * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (item.shapeType === 'line') {
        ctx.beginPath();
        ctx.moveTo(item.x1 * scale + offsetX, item.y1 * scale + offsetY);
        ctx.lineTo(item.x2 * scale + offsetX, item.y2 * scale + offsetY);
        ctx.stroke();
      } else if (item.shapeType === 'rect') {
        const x = Math.min(item.x1, item.x2) * scale + offsetX;
        const y = Math.min(item.y1, item.y2) * scale + offsetY;
        const w = Math.abs(item.x2 - item.x1) * scale;
        const h = Math.abs(item.y2 - item.y1) * scale;
        ctx.strokeRect(x, y, w, h);
      } else {
        const cx = (item.x1 + item.x2) / 2;
        const cy = (item.y1 + item.y2) / 2;
        const rx = Math.abs(item.x2 - item.x1) / 2;
        const ry = Math.abs(item.y2 - item.y1) / 2;
        ctx.beginPath();
        ctx.ellipse(
          cx * scale + offsetX,
          cy * scale + offsetY,
          Math.max(0.5, rx * scale),
          Math.max(0.5, ry * scale),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (item?.type === 'fill') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = item.color ?? '#000000';
      const r = Math.max(1.5, 3 * scale);
      ctx.beginPath();
      ctx.arc(item.x * scale + offsetX, item.y * scale + offsetY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
