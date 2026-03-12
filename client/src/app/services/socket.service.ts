import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly socket: Socket;

  constructor(private auth: AuthService) {
    const token = this.auth.getToken(); // JWT from local storage
    this.socket = io('http://localhost:3000', {
      path: '/api/socket.io',
      transports: ['websocket'],
      auth: { token },
    });
  }

  emit(event: string, data: any) {
    this.socket.emit(event, data);
  }

  listen(event: string): Observable<any> {
    return new Observable((subscriber) => {
      this.socket.on(event, (data) => subscriber.next(data));
    });
  }
}