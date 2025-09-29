import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../services/board.service';
import { Board } from '../models/board';
import { UserService } from '../services/user.service';
import { User } from '../models/user';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit {
  boards: Board[] = [];
  users: User[] = [];
  newBoardTitle = '';
  selectedOwnerId: number | null = null;
  auth: any;
  http: any;

    constructor(
    private readonly boardService: BoardService,
    private readonly userService: UserService,
    private readonly authService: AuthService
  ) {}

  ngOnInit() {
    this.loadBoards();
    this.loadUsers();
  }

  loadBoards() {
    this.boardService.getBoards().subscribe(data => {
      this.boards = data;
    });
  }

  loadUsers() {
    this.userService.getUsers().subscribe(data => {
      this.users = data;
    });
  }

  createBoard() {
    const userId = this.auth.getUserId();
    if (!userId) return;
  
    this.boardService.createBoard(this.newBoardTitle, userId).subscribe({
      next: (board) => {
        this.boards.push(board);
        this.newBoardTitle = '';
      },
      error: (err) => console.error(err)
    });
  }

  deleteBoard(id: number) {
    this.boardService.deleteBoard(id).subscribe(() => {
      this.loadBoards();
    });
  }
}