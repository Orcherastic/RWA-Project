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
        <h2>Register</h2> 
        <form (ngSubmit)="submit()"> 
            <input [(ngModel)]="displayName" name="displayName" placeholder="Display Name" required /> 
            <input [(ngModel)]="email" name="email" placeholder="Email" required /> 
            <input [(ngModel)]="password" name="password" placeholder="Password" type="password" required />
            <button type="submit">Register</button> 
            </form> 
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