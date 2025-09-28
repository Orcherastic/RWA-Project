import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../services/board.service';
import { Board } from '../models/board';
import { UserService } from '../services/user.service';
import { User } from '../models/user';

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
  authService: any;
  http: any;

    constructor(
    private readonly boardService: BoardService,
    private readonly userService: UserService
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

  createBoard(title: string) {
    const userId = this.authService.getUserId(); // decode from JWT
    this.http.post('http://localhost:3000/boards', { title, ownerId: userId })
      .subscribe({
        next: () => this.loadBoards(),
        error: (err: any) => console.error('Board creation failed', err),
      });
  }

  deleteBoard(id: number) {
    this.boardService.deleteBoard(id).subscribe(() => {
      this.loadBoards();
    });
  }
}