import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService, User } from '../../services/user.service';

@Component({
  selector: 'app-user-list',
  standalone: true,      
  imports: [CommonModule],
  templateUrl: './user-list.component.html'
})
export class UserListComponent implements OnInit {
  users: User[] = [];

  constructor(private readonly userService: UserService) {}

  ngOnInit() {
    this.userService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        console.log('Users fetched:', data); // 👈 debug
      },
      error: (err) => console.error('Error fetching users:', err)
    });
  }
}