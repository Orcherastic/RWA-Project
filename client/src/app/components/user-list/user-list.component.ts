import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { UserService } from '../../services/user.service';
import { User } from '../../models/user';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.scss']
})
export class UserListComponent implements OnInit {
  users: User[] = [];
  newUser: Partial<User> = { displayName: '', email: '' };
  editingUser: User | null = null;

  constructor(private readonly userService: UserService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.userService.getUsers().subscribe((data) => {
      this.users = data;
    });
  }

  addUser(): void {
    if (this.newUser.displayName && this.newUser.email) {
      this.userService.createUser(this.newUser as User).subscribe((created) => {
        this.users.push(created);
        this.newUser = { displayName: '', email: '' };
      });
    }
  }

  deleteUser(id: number): void {
    this.userService.deleteUser(id).subscribe(() => {
      this.users = this.users.filter((u) => u.id !== id);
    });
  }

  editUser(user: User): void {
    this.editingUser = { ...user };
  }

  saveUser(): void {
    if (this.editingUser && this.editingUser.id) {
      this.userService.updateUser(this.editingUser.id, this.editingUser).subscribe((updated) => {
        const index = this.users.findIndex((u) => u.id === updated.id);
        if (index !== -1) {
          this.users[index] = updated;
        }
        this.editingUser = null;
      });
    }
  }

  cancelEdit(): void {
    this.editingUser = null;
  }
}