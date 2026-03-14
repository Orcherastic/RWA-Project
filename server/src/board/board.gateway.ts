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
  private readonly boardStates = new Map<number, { items: any[]; layers: any[] }>();
  private readonly saveTimers = new Map<number, NodeJS.Timeout>();
  private readonly boardVersions = new Map<number, number>();
  private readonly maxSegments = 5000;
  private readonly compactTo = 4000;
  private readonly clearVotes = new Map<
    number,
    { approvers: Set<number>; timer?: NodeJS.Timeout; expiresAt: number }
  >();

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
        displayName?: string;
        email?: string;
        username?: string;
      };
      const userId = decoded.userId ?? decoded.sub;
      if (!userId) {
        console.log('❌ Invalid token payload');
        client.disconnect();
        return;
      }

      // SINGLE SOURCE OF TRUTH
      const displayName =
        decoded.displayName ?? decoded.email ?? decoded.username ?? `User ${userId}`;
      client.data.user = { id: userId, displayName };

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

      const room = `board-${boardId}`;
      client.leave(room);
      this.boardRooms.delete(client.id);

      const roomSize = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
      this.maybeFinalizeClear(boardId, roomSize);
      if (roomSize === 0) {
        // no active clients: free memory (state is already persisted)
        this.boardStates.delete(boardId);
        this.boardVersions.delete(boardId);
        const timer = this.saveTimers.get(boardId);
        if (timer) {
          clearTimeout(timer);
          this.saveTimers.delete(boardId);
        }
        const clearVote = this.clearVotes.get(boardId);
        if (clearVote?.timer) {
          clearTimeout(clearVote.timer);
        }
        this.clearVotes.delete(boardId);
      }
    }

    console.log('Client disconnected:', client.id);
    if (boardId) {
      const users = this.getPresenceList(boardId);
      this.server.to(`board-${boardId}`).emit('presence:update', { users });
    }
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
      let layers: any[] | null = null;
      if (board.content) {
        try {
          const parsed = JSON.parse(board.content);
          if (Array.isArray(parsed)) {
            strokes = parsed;
          } else if (parsed && typeof parsed === 'object') {
            strokes = Array.isArray(parsed.items) ? parsed.items : [];
            layers = Array.isArray(parsed.layers) ? parsed.layers : null;
          }
        } catch {
          strokes = [];
        }
      }
      const defaultLayer = { id: 'layer-1', name: 'Layer 1', visible: true };
      const normalized = strokes.map((s: any, idx: number) => {
        const id = typeof s?.id === 'string' ? s.id : `legacy-${boardId}-${idx}`;
        const strokeId =
          typeof s?.strokeId === 'string'
            ? s.strokeId
            : (typeof s?.id === 'string' ? s.id : `legacy-${boardId}-${idx}`);
        const type =
          s?.type === 'shape' ? 'shape' : s?.type === 'fill' ? 'fill' : 'stroke';
        const layerId = typeof s?.layerId === 'string' ? s.layerId : defaultLayer.id;
        if (type === 'shape') {
          return {
            id,
            strokeId,
            type: 'shape',
            shapeType: s.shapeType ?? 'line',
            userId: typeof s?.userId === 'number' ? s.userId : -1,
            x1: s.x1,
            y1: s.y1,
            x2: s.x2,
            y2: s.y2,
            color: s.color,
            lineWidth: s.lineWidth,
            tool: 'brush',
            layerId,
          };
        }
        if (type === 'fill') {
          return {
            id,
            strokeId,
            type: 'fill',
            userId: typeof s?.userId === 'number' ? s.userId : -1,
            x: s.x,
            y: s.y,
            color: s.color,
            tolerance: s.tolerance ?? 16,
            tool: 'fill',
            layerId,
          };
        }
        return {
          id,
          strokeId,
          type: 'stroke',
          userId: typeof s?.userId === 'number' ? s.userId : -1,
          fromX: s.fromX,
          fromY: s.fromY,
          toX: s.toX,
          toY: s.toY,
          color: s.color,
          lineWidth: s.lineWidth,
          tool: s.tool ?? 'brush',
          layerId,
        };
      });
      const normalizedLayers =
        layers && layers.length > 0
          ? layers.map((l: any, idx: number) => ({
              id: typeof l?.id === 'string' ? l.id : `layer-${idx + 1}`,
              name: l?.name ?? `Layer ${idx + 1}`,
              visible: l?.visible !== false,
            }))
          : [defaultLayer];
      this.boardStates.set(boardId, { items: normalized, layers: normalizedLayers });
      this.boardVersions.set(boardId, 0);
    }

    client.emit('board:state', {
      strokes: this.boardStates.get(boardId)?.items ?? [],
      layers: this.boardStates.get(boardId)?.layers ?? [],
      version: this.boardVersions.get(boardId) ?? 0,
    });

    const users = this.getPresenceList(boardId);
    this.server.to(room).emit('presence:update', { users });
  }

  // LEAVE BOARD
  @SubscribeMessage('leaveBoard')
  handleLeaveBoard(@ConnectedSocket() client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    const room = `board-${boardId}`;
    client.leave(room);
    this.boardRooms.delete(client.id);

    const roomSize = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    this.maybeFinalizeClear(boardId, roomSize);

    const users = this.getPresenceList(boardId);
    this.server.to(room).emit('presence:update', { users });
  }

  // DRAW
  @SubscribeMessage('draw')
  handleDraw(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    if (data?.type === 'stroke' || data?.type === 'shape' || data?.type === 'fill') {
      const user = client.data.user;
      if (!user) return;
      const strokeId = data.strokeId ?? data.id ?? `${user.id}-${Date.now()}`;
      const segmentId = data.id ?? `${strokeId}-${Date.now()}`;
      const state = this.boardStates.get(boardId);
      if (!state) return;
      const strokes = state.items;
      const layerId =
        typeof data.layerId === 'string'
          ? data.layerId
          : (state.layers[0]?.id ?? 'layer-1');
      if (data.type === 'shape') {
        strokes.push({
          id: segmentId,
          strokeId,
          type: 'shape',
          shapeType: data.shapeType ?? 'line',
          userId: user.id,
          x1: data.x1,
          y1: data.y1,
          x2: data.x2,
          y2: data.y2,
          color: data.color,
          lineWidth: data.lineWidth,
          tool: 'brush',
          layerId,
        });
      } else if (data.type === 'fill') {
        strokes.push({
          id: segmentId,
          strokeId,
          type: 'fill',
          userId: user.id,
          x: data.x,
          y: data.y,
          color: data.color,
          tolerance: data.tolerance ?? 16,
          tool: 'fill',
          layerId,
        });
      } else {
        strokes.push({
          id: segmentId,
          strokeId,
          type: 'stroke',
          userId: user.id,
          fromX: data.fromX,
          fromY: data.fromY,
          toX: data.toX,
          toY: data.toY,
          color: data.color,
          lineWidth: data.lineWidth,
          tool: data.tool,
          layerId,
        });
      }
      this.boardStates.set(boardId, state);
      const version = this.bumpVersion(boardId);
      this.scheduleSave(boardId);
      this.maybeCompact(boardId);

      data.id = segmentId;
      data.strokeId = strokeId;
      data.userId = user.id;
      data.version = version;
      data.layerId = layerId;
    }

    // Broadcast to everyone else in the board
    client.to(`board-${boardId}`).emit('draw', data);

    // client.emit('draw', data); // usually sender draws locally already
  }

  // UNDO
  @SubscribeMessage('undo')
  handleUndo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId?: number; strokeId?: string },
  ) {
    const user = client.data.user;
    if (!user) return;

    const boardId = data?.boardId ?? this.boardRooms.get(client.id);
    if (!boardId) return;

    const state = this.boardStates.get(boardId);
    if (!state) return;
    const strokes = state.items;
    let removedId: string | null = null;

    if (data?.strokeId) {
      const before = strokes.length;
      const filtered = strokes.filter(
        (s) => !(s.strokeId === data.strokeId && s.userId === user.id),
      );
      if (filtered.length !== before) {
        removedId = data.strokeId;
        state.items = filtered;
        this.boardStates.set(boardId, state);
      }
    } else {
      for (let i = strokes.length - 1; i >= 0; i -= 1) {
        if (strokes[i].userId === user.id) {
          removedId = strokes[i].strokeId ?? strokes[i].id;
          const targetId = removedId;
          const filtered = strokes.filter(
            (s) => !(s.strokeId === targetId && s.userId === user.id),
          );
          state.items = filtered;
          this.boardStates.set(boardId, state);
          break;
        }
      }
    }

    if (!removedId) return;
    const version = this.bumpVersion(boardId);
    this.scheduleSave(boardId);
    client.to(`board-${boardId}`).emit('undo', { strokeId: removedId, version });
  }

  // REDO
  @SubscribeMessage('redo')
  handleRedo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId?: number; strokeId?: string; strokes?: any[] },
  ) {
    const user = client.data.user;
    if (!user) return;

    const boardId = data?.boardId ?? this.boardRooms.get(client.id);
    if (!boardId) return;
    const incoming = Array.isArray(data?.strokes) ? data.strokes : [];
    const strokeId = data?.strokeId ?? `${user.id}-${Date.now()}`;
    if (incoming.length === 0) return;

    const state = this.boardStates.get(boardId);
    if (!state) return;
    const strokes = state.items;
    const broadcast: any[] = [];
    for (const seg of incoming) {
      const segmentId = seg.id ?? `${strokeId}-${Date.now()}`;
      if (seg.type === 'shape') {
        const entry = {
          id: segmentId,
          strokeId,
          type: 'shape',
          shapeType: seg.shapeType ?? 'line',
          userId: user.id,
          x1: seg.x1,
          y1: seg.y1,
          x2: seg.x2,
          y2: seg.y2,
          color: seg.color,
          lineWidth: seg.lineWidth,
          tool: 'brush',
          layerId: seg.layerId,
        };
        strokes.push(entry);
        broadcast.push(entry);
      } else if (seg.type === 'fill') {
        const entry = {
          id: segmentId,
          strokeId,
          type: 'fill',
          userId: user.id,
          x: seg.x,
          y: seg.y,
          color: seg.color,
          tolerance: seg.tolerance ?? 16,
          tool: 'fill',
          layerId: seg.layerId,
        };
        strokes.push(entry);
        broadcast.push(entry);
      } else {
        const entry = {
          id: segmentId,
          strokeId,
          type: 'stroke',
          userId: user.id,
          fromX: seg.fromX,
          fromY: seg.fromY,
          toX: seg.toX,
          toY: seg.toY,
          color: seg.color,
          lineWidth: seg.lineWidth,
          tool: seg.tool,
          layerId: seg.layerId,
        };
        strokes.push(entry);
        broadcast.push(entry);
      }
    }
    this.boardStates.set(boardId, state);
    const version = this.bumpVersion(boardId);
    this.scheduleSave(boardId);
    this.maybeCompact(boardId);

    for (const seg of broadcast) {
      client.to(`board-${boardId}`).emit('draw', {
        ...seg,
        version,
      });
    }
  }


  // CURSOR MOVE
  @SubscribeMessage('cursor:move')
  handleCursorMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { x: number; y: number; tool?: string },
  ) {
    const user = client.data.user;
    if (!user) return;

    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    // Send to everyone else in the same board
    const color = this.getUserColor(user.id);
    client.to(`board-${boardId}`).emit('cursor:update', {
      userId: user.id,
      displayName: user.displayName,
      color,
      tool: (data as { tool?: string }).tool,
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

  private getUserColor(userId: number) {
    const hue = (userId * 47) % 360;
    return `hsl(${hue}, 70%, 45%)`;
  }

  // CLEAR BOARD
  @SubscribeMessage('clear')
  handleClear(@ConnectedSocket() client: Socket) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;

    const user = client.data.user;
    if (!user) return;

    const room = `board-${boardId}`;
    const roomSize = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    if (roomSize <= 1) {
      this.applyClear(boardId, room);
      return;
    }

    const existing = this.clearVotes.get(boardId);
    const approvers = existing?.approvers ?? new Set<number>();
    approvers.add(user.id);

    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const expiresAt = Date.now() + 10_000;
    const timer = setTimeout(() => {
      this.clearVotes.delete(boardId);
      this.server.to(room).emit('clear:status', {
        approvals: 0,
        required: roomSize,
        approvers: [],
        expiresAt: null,
      });
    }, 10_000);

    this.clearVotes.set(boardId, { approvers, timer, expiresAt });
    this.server.to(room).emit('clear:status', {
      approvals: approvers.size,
      required: roomSize,
      approvers: Array.from(approvers),
      expiresAt,
    });

    if (approvers.size >= roomSize) {
      if (timer) clearTimeout(timer);
      this.clearVotes.delete(boardId);
      this.applyClear(boardId, room);
    }
  }

  // RESYNC
  @SubscribeMessage('board:resync')
  handleResync(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { boardId?: number },
  ) {
    const boardId = data?.boardId ?? this.boardRooms.get(client.id);
    if (!boardId) return;
    client.emit('board:state', {
      strokes: this.boardStates.get(boardId)?.items ?? [],
      layers: this.boardStates.get(boardId)?.layers ?? [],
      version: this.boardVersions.get(boardId) ?? 0,
    });
  }

  // SHAPE UPDATE
  @SubscribeMessage('shape:update')
  handleShapeUpdate(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;
    if (!data?.id) return;

    const state = this.boardStates.get(boardId);
    if (!state) return;
    const idx = state.items.findIndex((s) => s.type === 'shape' && s.id === data.id);
    if (idx < 0) return;

    state.items[idx] = {
      ...state.items[idx],
      x1: data.x1,
      y1: data.y1,
      x2: data.x2,
      y2: data.y2,
      shapeType: data.shapeType ?? state.items[idx].shapeType,
      color: data.color ?? state.items[idx].color,
      lineWidth: data.lineWidth ?? state.items[idx].lineWidth,
    };
    this.boardStates.set(boardId, state);
    const version = this.bumpVersion(boardId);
    this.scheduleSave(boardId);
    this.server.to(`board-${boardId}`).emit('shape:update', {
      ...state.items[idx],
      version,
    });
  }

  // LAYERS
  @SubscribeMessage('layers:set')
  handleLayersSet(@ConnectedSocket() client: Socket, @MessageBody() data: { layers?: any[] }) {
    const boardId = this.boardRooms.get(client.id);
    if (!boardId) return;
    const state = this.boardStates.get(boardId);
    if (!state) return;
    const layers = Array.isArray(data?.layers) ? data.layers : [];
    if (layers.length === 0) return;
    state.layers = layers.map((l: any, idx: number) => ({
      id: typeof l?.id === 'string' ? l.id : `layer-${idx + 1}`,
      name: l?.name ?? `Layer ${idx + 1}`,
      visible: l?.visible !== false,
    }));
    this.boardStates.set(boardId, state);
    const version = this.bumpVersion(boardId);
    this.scheduleSave(boardId);
    this.server.to(`board-${boardId}`).emit('layers:update', {
      layers: state.layers,
      version,
    });
  }

  private scheduleSave(boardId: number) {
    const existing = this.saveTimers.get(boardId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      this.saveTimers.delete(boardId);
      const state = this.boardStates.get(boardId);
      const items = state?.items ?? [];
      const layers = state?.layers ?? [];
      try {
        await this.boardService.saveContent(boardId, JSON.stringify({ items, layers }));
      } catch (err) {
        console.log('Failed to persist board content', { boardId, err });
      }
    }, 1000);

    this.saveTimers.set(boardId, timer);
  }

  private bumpVersion(boardId: number) {
    const next = (this.boardVersions.get(boardId) ?? 0) + 1;
    this.boardVersions.set(boardId, next);
    return next;
  }

  private applyClear(boardId: number, room: string) {
    const state = this.boardStates.get(boardId);
    if (!state) return;
    state.items = [];
    this.boardStates.set(boardId, state);
    const version = this.bumpVersion(boardId);
    this.scheduleSave(boardId);
    this.server.to(room).emit('clear', { version });
    this.server.to(room).emit('clear:status', {
      approvals: 0,
      required: 0,
      approvers: [],
      expiresAt: null,
    });
  }

  private maybeFinalizeClear(boardId: number, roomSize: number) {
    const vote = this.clearVotes.get(boardId);
    if (!vote) return;
    if (roomSize <= 1) {
      if (vote.timer) clearTimeout(vote.timer);
      this.clearVotes.delete(boardId);
      this.applyClear(boardId, `board-${boardId}`);
      return;
    }
    if (vote.approvers.size >= roomSize) {
      if (vote.timer) clearTimeout(vote.timer);
      this.clearVotes.delete(boardId);
      this.applyClear(boardId, `board-${boardId}`);
    }
  }

  private getPresenceList(boardId: number) {
    const users: Array<{ id: number; displayName: string }> = [];
    for (const [socketId, bId] of this.boardRooms.entries()) {
      if (bId !== boardId) continue;
      const sock = this.server.sockets.sockets.get(socketId);
      const user = sock?.data?.user;
      if (user?.id) {
        users.push({ id: user.id, displayName: user.displayName ?? `User ${user.id}` });
      }
    }
    const unique = new Map<number, { id: number; displayName: string }>();
    for (const u of users) unique.set(u.id, u);
    return Array.from(unique.values());
  }

  private maybeCompact(boardId: number) {
    const state = this.boardStates.get(boardId);
    if (!state || state.items.length <= this.maxSegments) return;

    const compacted = state.items.slice(-this.compactTo);
    state.items = compacted;
    this.boardStates.set(boardId, state);
    const version = this.bumpVersion(boardId);
    this.scheduleSave(boardId);

    // Force clients to resync to the compacted state
    this.server.to(`board-${boardId}`).emit('board:state', {
      strokes: compacted,
      layers: state.layers,
      version,
    });
  }
}
