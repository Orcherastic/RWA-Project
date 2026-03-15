import { BoardComponent } from './board/board.component';
import { LoginComponent } from './auth/login.component';
import { RegisterComponent } from './auth/register.component';
import { AuthGuard } from './guards/auth.guard';
import { Routes } from '@angular/router';
import { WhiteboardComponent } from './whiteboard/whiteboard.component';
import { MainComponent } from './main/main.component';

export const routes : Routes = [
  { path: '', component: MainComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'boards', component: BoardComponent, canActivate: [AuthGuard] },
  { path: 'boards/:id', component: WhiteboardComponent, canActivate: [AuthGuard] },
];
