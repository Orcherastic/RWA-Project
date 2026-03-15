import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="main-page">
      <h1>Collaborative Whiteboard</h1>
      <div class="actions">
        <a class="primary" routerLink="/login">Sign In</a>
        <a class="secondary" routerLink="/register">Register</a>
      </div>
    </div>
  `,
  styles: [
    `
      .main-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 20px;
        background: #f7f7f7;
        color: #111;
      }
      h1 {
        font-size: 32px;
        margin: 0;
      }
      .actions {
        display: flex;
        gap: 12px;
      }
      .actions a {
        text-decoration: none;
        padding: 10px 18px;
        border-radius: 6px;
        border: 1px solid #222;
        font-weight: 600;
      }
      .actions a.primary {
        background: #111;
        color: #fff;
      }
      .actions a.secondary {
        background: #fff;
        color: #111;
      }
    `,
  ],
})
export class MainComponent {}
