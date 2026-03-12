import { Injectable } from '@angular/core';

export interface CursorPosition {
  x: number;
  y: number;
  color: string;
  displayName: string;
  tool: 'brush' | 'eraser';
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
    tool: 'brush' | 'eraser',
  ) {
    this.cursors.set(userId, { x, y, displayName, color, tool });
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
}
