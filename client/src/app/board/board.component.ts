import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../services/board.service';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { Subject, combineLatest, from, merge, of, zip } from 'rxjs';
import { map, shareReplay, take, takeUntil } from 'rxjs/operators';
import { BoardItemComponent } from '../components/board-item/board-item.component';
import { Store } from '@ngrx/store';
import { createBoard, deleteBoard, loadBoards, renameBoard } from '../state/boards/boards.actions';
import { selectAllBoards } from '../state/boards/boards.selectors';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardItemComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit, OnDestroy {
  newBoardTitle = '';
  boards: any[] = [];
  boardCount = 0;
  ownedBoardsCount = 0;
  serverStatus = 'Checking...';

  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new Subject<void>();

  constructor(private readonly boardService: BoardService,
      private readonly router: Router,
      private readonly authService: AuthService,
      private readonly store: Store
  ) {}

  ngOnInit() {
    const trigger$ = merge(of(null), this.refresh$);
    trigger$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.store.dispatch(loadBoards());
    });

    const boards$ = this.store.select(selectAllBoards).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    boards$.pipe(takeUntil(this.destroy$)).subscribe((boards) => {
      const normalizedBoards = boards.map((board) => ({
        ...board,
        title: board.title?.trim() ?? '',
      }));
      normalizedBoards.forEach((board) => {
        if (!board.title) board.title = 'Untitled';
      });
      this.boards = normalizedBoards;
      this.boardCount = normalizedBoards.reduce((acc) => acc + 1, 0);
    });

    const userId$ = of(this.authService.getUserId());
    combineLatest([boards$, userId$])
      .pipe(
        map(([boards, userId]) =>
          userId ? boards.filter((board) => board.ownerId === userId).length : 0,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((count) => {
        this.ownedBoardsCount = count;
      });

    zip([boards$.pipe(take(1)), from(this.boardService.fetchServerStatus())])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([, status]) => {
        this.serverStatus = status.ok ? 'Online' : 'Offline';
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  createBoard() {
    this.store.dispatch(createBoard({ title: this.newBoardTitle }));
    this.newBoardTitle = '';
  }

  openBoard(boardId: number) {
    this.router.navigate(['/boards', boardId]);
  }

  promptShare(board: any) {
    const email = prompt('Enter user email to share with');
    if (!email) return;

    this.boardService.shareBoard(board.id, email).subscribe({
      next: () => alert('Board shared successfully'),
      error: err => alert(err.error?.message || 'Share failed'),
    });
  }

  renameBoard(board: any, newTitle: string) {
    if (!newTitle.trim()) return;
    this.store.dispatch(renameBoard({ id: board.id, title: newTitle }));
  }

  deleteBoard(board: any) {
    if (!confirm(`Delete board "${board.title}"?`)) return;
    this.store.dispatch(deleteBoard({ id: board.id }));
  }
}
