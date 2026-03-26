import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { BoardInvite } from '../models/board-invite';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private readonly apiBase = 'http://localhost:3000/api';
  private readonly apiUrl = 'http://localhost:3000/api/boards';

    constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  private authOptions() {
    const token = this.authService.getToken();
    if (!token) return {};
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`,
      }),
    };
  }

  getBoards(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl, this.authOptions());
  }

  getBoardById(boardId: number) {
    return this.http.get<any>(`${this.apiUrl}/${boardId}`, this.authOptions());
  }

  createBoard(title: string): Observable<any> {
    const userId = this.authService.getUserId();

    if (!userId) {
      throw new Error('User not logged in');
    }

    return this.http.post(
      this.apiUrl,
      { title, ownerId: userId },
      this.authOptions(),
    );
  }

  shareBoard(boardId: number, email: string) {
    return this.http.post(
      `${this.apiUrl}/${boardId}/share`,
      { email },
      this.authOptions(),
    );
  }

  getInvites(): Observable<BoardInvite[]> {
    return this.http.get<BoardInvite[]>(
      `${this.apiUrl}/invites`,
      this.authOptions(),
    );
  }

  acceptInvite(inviteId: number): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/invites/${inviteId}/accept`,
      {},
      this.authOptions(),
    );
  }

  declineInvite(inviteId: number): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/invites/${inviteId}/decline`,
      {},
      this.authOptions(),
    );
  }

  updateBoardContent(boardId: number, content: string) {
    return this.http.put(
      `${this.apiUrl}/${boardId}/content`,
      { content },
      this.authOptions(),
    );
  }

  renameBoard(id: number, newTitle: string): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/${id}`,
      { title: newTitle },
      this.authOptions(),
    );
  }

  deleteBoard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`, this.authOptions());
  }

  leaveBoard(id: number): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/leave`,
      {},
      this.authOptions(),
    );
  }

  async fetchServerStatus(): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(this.apiBase);
    const message = await response.text();
    return { ok: response.ok, message };
  }
}
