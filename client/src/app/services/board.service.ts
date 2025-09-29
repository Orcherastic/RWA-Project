import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private readonly apiUrl = 'http://localhost:3000/boards';

  constructor(private readonly http: HttpClient) {}

  getBoards(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  createBoard(title: string, ownerId: number): Observable<any> {
    return this.http.post(this.apiUrl, { title, ownerId });
  }

  deleteBoard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}