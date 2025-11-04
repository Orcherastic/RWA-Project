import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class BoardGateway {
  @WebSocketServer()
  server: Server;
  private boardRooms = new Map<string, number>();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (boardId) {
      client.leave(`board-${boardId}`);
      this.boardRooms.delete(client.id);
    }
    console.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('joinBoard')
  handleJoinBoard(client: Socket, boardId: number) {
    client.join(`board-${boardId}`);
    this.boardRooms.set(client.id, boardId);
    console.log(`Client ${client.id} joined board ${boardId}`);
  }

  // When a user draws on the canvas
  @SubscribeMessage('draw')
  handleDraw(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    // Only broadcast to clients in the same board
    client.to(`board-${boardId}`).emit('draw', data);
  }

  @SubscribeMessage('clear')
  handleClear(@ConnectedSocket() client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    client.to(`board-${boardId}`).emit('clear');
  }
}
