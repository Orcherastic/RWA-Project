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
    <h2>Login</h2>
    <form (ngSubmit)="submit()">
      <input [(ngModel)]="email" name="email" placeholder="email" required />
      <input [(ngModel)]="password" name="password" placeholder="password" type="password" required />
      <button type="submit">Login</button>
    </form>
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
          this.auth.saveToken(res.access_token);
          if (res.user) this.auth.saveUser(res.user);
          this.router.navigate(['/boards']);
        },
        error: err => alert('Login failed: ' + (err?.error?.message || err.statusText))
      });
  }
}