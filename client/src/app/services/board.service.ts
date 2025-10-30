import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private readonly apiUrl = 'http://localhost:3000/boards';

    constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  getBoards(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  createBoard(title: string): Observable<any> {
    const userId = this.authService.getUserId();

    if (!userId) {
      throw new Error('User not logged in');
    }

    return this.http.post(this.apiUrl, { title, ownerId: userId });
  }

  renameBoard(id: number, newTitle: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}`, { title: newTitle });
  }

  deleteBoard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}