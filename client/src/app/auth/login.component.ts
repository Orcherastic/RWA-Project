import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-page page">
      <div class="auth-card">
        <h2>Login</h2>
        <p class="auth-subtitle">Welcome back. Pick up where you left off.</p>
        <form class="form-stack" (ngSubmit)="submit()">
          <label class="field">
            <span>Email</span>
            <input [(ngModel)]="email" name="email" placeholder="you@example.com" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input [(ngModel)]="password" name="password" placeholder="••••••••" type="password" required />
          </label>
          <button class="button primary" type="submit">Login</button>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  email = '';
  password = '';
  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  submit() {
    this.auth.login({ email: this.email, password: this.password })
      .subscribe({
        next: res => {
          this.auth.saveAuth(res);
          this.router.navigate(['/boards']);
        },
        error: err => alert('Login failed: ' + (err?.error?.message || err.statusText))
      });
  }
}
