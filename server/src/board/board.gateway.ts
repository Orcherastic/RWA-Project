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

console.log('🚀 BoardGateway file loaded');

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/api/socket.io',
  transports: ['websocket'],
})
export class BoardGateway {
  @WebSocketServer()
  server: Server;

  private readonly boardRooms = new Map<string, number>();
  private readonly boardStates = new Map<number, any[]>();
  private readonly saveTimers = new Map<number, NodeJS.Timeout>();

  constructor(private readonly boardService: BoardService) {}

  // CONNECTION
  async handleConnection(client: Socket) {
    try {
      console.log('🔥 handleConnection called');
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      console.log('🔑 token:', token);

      if (!token) {
        console.log('❌ No token, disconnecting');
        client.disconnect();
        return;
      }

      const secret = process.env.JWT_SECRET ?? 'yourSecretKey';
      console.log('🔐 JWT_SECRET exists:', !!secret);

      if (!secret) {
        console.log('❌ No JWT_SECRET');
        client.disconnect();
        return;
      }

      const decoded = jwt.verify(token, secret) as {
        userId?: number;
        sub?: number;
      };
      const userId = decoded.userId ?? decoded.sub;
      if (!userId) {
        console.log('❌ Invalid token payload');
        client.disconnect();
        return;
      }

      // SINGLE SOURCE OF TRUTH
      client.data.user = { id: userId };

      console.log(`Client connected ${client.id}, user ${userId}`);
    } catch (err) {
      console.log('❌ JWT verification failed:', err);
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
    const board = await this.boardService.findOneById(boardId, user.id);

    const room = `board-${boardId}`;
    client.join(room);

    // ✅ Track board for disconnect
    this.boardRooms.set(client.id, boardId);

    console.log(`User ${user.id} joined ${room}`);
    console.log(`JOIN: socket=${client.id} user=${user.id} room=board-${boardId}`);

    if (!this.boardStates.has(boardId)) {
      let strokes: any[] = [];
      if (board.content) {
        try {
          strokes = JSON.parse(board.content);
        } catch {
          strokes = [];
        }
      }
      this.boardStates.set(boardId, strokes);
    }

    client.emit('board:state', {
      strokes: this.boardStates.get(boardId) ?? [],
    });
  }

  // DRAW
  @SubscribeMessage('draw')
  handleDraw(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    if (data?.type === 'stroke') {
      const strokes = this.boardStates.get(boardId) ?? [];
      strokes.push({
        fromX: data.fromX,
        fromY: data.fromY,
        toX: data.toX,
        toY: data.toY,
        color: data.color,
        lineWidth: data.lineWidth,
        tool: data.tool,
      });
      this.boardStates.set(boardId, strokes);
      this.scheduleSave(boardId);
    }

    // Broadcast to everyone else in the board
    client.to(`board-${boardId}`).emit('draw', data);

    // client.emit('draw', data); // usually sender draws locally already
  }


  // CURSOR MOVE
  @SubscribeMessage('cursor:move')
  handleCursorMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { x: number; y: number },
  ) {
    const user = client.data.user;
    if (!user) return;

    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    // Send to everyone else in the same board
    client.to(`board-${boardId}`).emit('cursor:update', {
      userId: user.id,
      x: data.x,
      y: data.y,
    });
  }

  // CURSOR LEAVE
  @SubscribeMessage('cursor:leave')
  handleCursorLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId?: number },
  ) {
    const user = client.data.user;
    if (!user) return;

    const boardId = data?.boardId ?? this.boardRooms.get(client.id);
    if (!boardId) return;

    client.to(`board-${boardId}`).emit('cursor:leave', {
      userId: user.id,
    });
  }

  // CLEAR BOARD
  @SubscribeMessage('clear')
  handleClear(@ConnectedSocket() client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    this.boardStates.set(boardId, []);
    this.scheduleSave(boardId);
    client.to(`board-${boardId}`).emit('clear');
  }

  private scheduleSave(boardId: number) {
    const existing = this.saveTimers.get(boardId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      this.saveTimers.delete(boardId);
      const strokes = this.boardStates.get(boardId) ?? [];
      try {
        await this.boardService.saveContent(boardId, JSON.stringify(strokes));
      } catch (err) {
        console.log('Failed to persist board content', { boardId, err });
      }
    }, 1000);

    this.saveTimers.set(boardId, timer);
  }
}
