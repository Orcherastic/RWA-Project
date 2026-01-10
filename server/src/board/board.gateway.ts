import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  WebSocketServer,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { BoardService } from './board.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class BoardGateway {
  @WebSocketServer()
  server: Server;

  private readonly boardRooms = new Map<string, number>();

  constructor(private readonly boardService: BoardService) {}

  // CONNECTION
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect();
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        client.disconnect();
        return;
      }

      const decoded = jwt.verify(token, secret) as { userId: number };

      // SINGLE SOURCE OF TRUTH
      client.data.user = { id: decoded.userId };

      console.log(`Client connected ${client.id}, user ${decoded.userId}`);
    } catch {
      client.disconnect();
    }
  }

  // DISCONNECT
  handleDisconnect(client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    const user = client.data.user;

    if (boardId && user) {
      this.server.to(`board-${boardId}`).emit('cursor:leave', {
        userId: user.id,
      });

      client.leave(`board-${boardId}`);
      this.boardRooms.delete(client.id);
    }

    console.log('Client disconnected:', client.id);
  }

  // JOIN BOARD
  @SubscribeMessage('joinBoard')
  async handleJoinBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() boardId: number,
  ) {
    const user = client.data.user;
    if (!user) {
      client.disconnect();
      return;
    }

    // 🔒 Authorization check
    await this.boardService.findOneById(boardId, user.id);

    const room = `board-${boardId}`;
    client.join(room);

    // ✅ Track board for disconnect
    this.boardRooms.set(client.id, boardId);

    console.log(`User ${user.id} joined ${room}`);
  }

  // DRAW
  @SubscribeMessage('draw')
  handleDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    client.to(`board-${boardId}`).emit('draw', data);
  }

  // CURSOR MOVE
  @SubscribeMessage('cursor:move')
  handleCursorMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId: number; x: number; y: number },
  ) {
    const user = client.data.user;
    if (!user) return;

    client.to(`board-${data.boardId}`).emit('cursor:update', {
      userId: user.id,
      x: data.x,
      y: data.y,
    });
  }

  // CLEAR BOARD
  @SubscribeMessage('clear')
  handleClear(@ConnectedSocket() client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    client.to(`board-${boardId}`).emit('clear');
  }
}
