import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BoardService } from './board.service';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class BoardGateway {
  @WebSocketServer()
  server: Server;
  private readonly boardRooms = new Map<string, number>();
  boardService: BoardService;

  // eslint-disable-next-line @typescript-eslint/require-await
  async handleConnection(client: Socket) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('JWT_SECRET not set in environment variables');
        client.disconnect();
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
      const decoded = jwt.verify(token, secret) as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      (client as any).user = decoded;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`Client connected: ${client.id}, user: ${decoded.userId}`);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.error('Socket auth failed:', err.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (boardId) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      client.leave(`board-${boardId}`);
      this.boardRooms.delete(client.id);
    }
    console.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('joinBoard')
  async handleJoinBoard(client: Socket, boardId: number) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const user = (client as any).user; // populated from JWT (see next step)
      if (!user) {
        client.emit('error', 'Unauthorized');
        client.disconnect();
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      const board = await this.boardService.findOneById(boardId, user.userId);
      if (!board) {
        client.emit('error', 'Board not found');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      client.join(boardId.toString());
      console.log(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Client ${client.id} (user ${user.userId}) joined board ${boardId}`,
      );
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.error('Socket join error:', err.message);
      client.emit('error', 'Access denied');
    }
  }

  // When a user draws on the canvas
  @SubscribeMessage('draw')
  async handleDraw(client: Socket, payload: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { boardId, stroke } = payload;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const user = (client as any).user;

    // Verify user still has permission
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    const board = await this.boardService.findOneById(boardId, user.userId);
    if (!board) {
      client.emit('error', 'Access denied');
      return;
    }

    // Broadcast to room
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    client.to(boardId.toString()).emit('draw', stroke);
  }

  @SubscribeMessage('clear')
  handleClear(@ConnectedSocket() client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    client.to(`board-${boardId}`).emit('clear');
  }
}
