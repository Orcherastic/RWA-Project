import { BoardComponent } from './board/board.component';
import { LoginComponent } from './auth/login.component';
import { RegisterComponent } from './auth/register.component';
import { AuthGuard } from './guards/auth.guard';
import { Routes } from '@angular/router';

export const routes : Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'boards', component: BoardComponent, canActivate: [AuthGuard] },
  { path: '', redirectTo: 'boards', pathMatch: 'full' },
];