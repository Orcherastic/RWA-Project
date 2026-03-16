import { Component } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { FormsModule } from '@angular/forms'; 
import { AuthService } from './auth.service'; 
import { Router } from '@angular/router'; 

@Component({ 
    selector: 'app-register', 
    standalone: true, 
    imports: [CommonModule, FormsModule], 
    template: ` 
        <div class="auth-page page">
          <div class="auth-card">
            <h2>Register</h2> 
            <p class="auth-subtitle">Create an account to start drawing together.</p>
            <form class="form-stack" (ngSubmit)="submit()"> 
              <label class="field">
                <span>Display Name</span>
                <input [(ngModel)]="displayName" name="displayName" placeholder="Your name" required /> 
              </label>
              <label class="field">
                <span>Email</span>
                <input [(ngModel)]="email" name="email" placeholder="you@example.com" required /> 
              </label>
              <label class="field">
                <span>Password</span>
                <input [(ngModel)]="password" name="password" placeholder="Create a password" type="password" required />
              </label>
              <button class="button primary" type="submit">Register</button> 
            </form> 
          </div>
        </div>
        ` 
        }) 
export class RegisterComponent { 
    displayName = ''; 
    email = ''; 
    password = ''; 
    constructor(private readonly auth: AuthService, private readonly router: Router) {} 
    submit() { 
        this.auth.register({ 
            displayName: this.displayName, 
            email: this.email, 
            password: this.password 
        }).subscribe({ 
            next: res => { 
                this.auth.saveToken(res.access_token); 
                if (res.user) this.auth.saveUser(res.user); 
                this.router.navigate(['/boards']); 
            }, 
            error: err => { 
                alert('Registration failed: ' + (err?.error?.message || err.statusText)); 
            } 
        }); 
    } 
}
