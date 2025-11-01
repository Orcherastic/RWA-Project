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
    origin: 'http://localhost:4200',
  },
})
export class BoardGateway {
  @WebSocketServer()
  server: Server;

  // When a user draws on the canvas
  @SubscribeMessage('draw')
  handleDraw(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    // Broadcast drawing event to all clients except sender
    client.broadcast.emit('draw', data);
  }

  // Optional: notify when users join or leave
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }
}
