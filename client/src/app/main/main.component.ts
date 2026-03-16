import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="landing page">
      <div class="landing-card">
        <div class="badge">Collaborative Whiteboard</div>
        <h1>Sketch together in real time.</h1>
        <p class="landing-subtitle">
          Create boards, share links, and keep ideas moving across your team.
        </p>
        <div class="actions">
          <a class="button primary" routerLink="/login">Sign In</a>
          <a class="button ghost" routerLink="/register">Register</a>
        </div>
      </div>
    </div>
  `,
})
export class MainComponent {}
