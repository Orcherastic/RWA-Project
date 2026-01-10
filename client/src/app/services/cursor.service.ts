import { Injectable } from '@angular/core';

export interface CursorPosition {
  x: number;
  y: number;
}

@Injectable({ providedIn: 'root' })
export class CursorService {
  private cursors = new Map<number, CursorPosition>();

  set(userId: number, x: number, y: number) {
    this.cursors.set(userId, { x, y });
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