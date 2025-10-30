import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../services/board.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent {
  newBoardTitle = '';
  boards: any[] = [];

  constructor(private readonly boardService: BoardService) {}

  ngOnInit() {
    this.loadBoards();
  }

  loadBoards() {
    this.boardService.getBoards().subscribe({
      next: (boards) => (this.boards = boards),
      error: (err) => console.error('Error loading boards:', err)
    });
  }

  createBoard() {
    this.boardService.createBoard(this.newBoardTitle).subscribe({
      next: () => {
        this.newBoardTitle = '';
        this.loadBoards();
      },
      error: (err) => console.error('Error creating board:', err)
    });
  }

  renameBoard(board: any, newTitle: string) {
    if (!newTitle.trim()) return;
    this.boardService.renameBoard(board.id, newTitle).subscribe({
      next: () => this.loadBoards(),
      error: (err) => console.error('Failed to rename board:', err),
    });
  }

  deleteBoard(board: any) {
    if (!confirm(`Delete board "${board.title}"?`)) return;
    this.boardService.deleteBoard(board.id).subscribe({
      next: () => this.loadBoards(),
      error: (err) => console.error('Failed to delete board:', err)
    });
  }
}