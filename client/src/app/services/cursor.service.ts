import { Injectable } from '@angular/core';

export interface CursorPosition {
  x: number;
  y: number;
  color: string;
  displayName: string;
  tool: 'brush' | 'eraser' | 'line' | 'rect' | 'circle';
  lastSeen: number;
}

@Injectable({ providedIn: 'root' })
export class CursorService {
  private cursors = new Map<number, CursorPosition>();

  set(
    userId: number,
    x: number,
    y: number,
    displayName: string,
    color: string,
    tool: 'brush' | 'eraser' | 'line' | 'rect' | 'circle',
  ) {
    this.cursors.set(userId, {
      x,
      y,
      displayName,
      color,
      tool,
      lastSeen: Date.now(),
    });
  }

  remove(userId: number) {
    this.cursors.delete(userId);
  }

  all(): Map<number, CursorPosition> {
    return this.cursors;
  }

  clear() {
    this.cursors.clear();
  }

  pruneStale(maxAgeMs: number) {
    const now = Date.now();
    for (const [userId, cursor] of this.cursors.entries()) {
      if (now - cursor.lastSeen > maxAgeMs) {
        this.cursors.delete(userId);
      }
    }
  }
}
