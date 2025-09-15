import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../services/board.service';
import { Board } from '../models/board';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit {
  boards: Board[] = [];
  newBoardTitle = '';

  constructor(private readonly boardService: BoardService) {}

  ngOnInit() {
    this.loadBoards();
  }

  loadBoards() {
    this.boardService.getBoards().subscribe(data => {
      this.boards = data;
    });
  }

  addBoard() {
    if (!this.newBoardTitle.trim()) return;
    const board = { title: this.newBoardTitle, ownerId: 2 }; // hardcoded owner
    this.boardService.createBoard(board).subscribe(() => {
      this.newBoardTitle = '';
      this.loadBoards();
    });
  }

  deleteBoard(id: number) {
    this.boardService.deleteBoard(id).subscribe(() => {
      this.loadBoards();
    });
  }
}