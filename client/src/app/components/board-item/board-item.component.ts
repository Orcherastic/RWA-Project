import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-board-item',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board-item.component.html',
  styleUrls: ['./board-item.component.scss'],
})
export class BoardItemComponent {
  @Input({ required: true }) board!: any;

  @Output() open = new EventEmitter<number>();
  @Output() share = new EventEmitter<any>();
  @Output() rename = new EventEmitter<{ board: any; title: string }>();
  @Output() remove = new EventEmitter<any>();

  onOpen() {
    this.open.emit(this.board.id);
  }

  onShare() {
    this.share.emit(this.board);
  }

  onRename() {
    this.rename.emit({ board: this.board, title: this.board.title });
  }

  onDelete() {
    this.remove.emit(this.board);
  }
}
