import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { UserService, User } from '../../services/user.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-list.component.html'
})
export class UserListComponent implements OnInit {
  users: User[] = [];

  // form model
  newUser: User = {
    email: '',
    password: '',
    displayName: ''
  };

  constructor(private readonly userService: UserService) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.userService.getUsers().subscribe(data => {
      this.users = data;
    });
  }

  addUser() {
    if (!this.newUser.email || !this.newUser.password || !this.newUser.displayName) {
      alert('All fields are required');
      return;
    }

    this.userService.createUser(this.newUser).subscribe(() => {
      this.newUser = { email: '', password: '', displayName: '' }; // reset form
      this.loadUsers(); // refresh list
    });
  }

  deleteUser(id: number) {  
    this.userService.deleteUser(id).subscribe(() => {
      this.loadUsers(); // refresh list after deletion
    });
  }

  editingUser: User | null = null;

  startEdit(user: User) {
    this.editingUser = { ...user }; // copy user into editing mode
  }

  saveEdit() {
    if (!this.editingUser?.id) return;
  
    const { displayName, email } = this.editingUser;
  
    this.userService.updateUser(this.editingUser.id, { displayName, email }).subscribe({
      next: () => {
        this.editingUser = null;
        this.loadUsers();
      },
      error: (err) => console.error('Update failed:', err)
    });
  }

  cancelEdit() {
    this.editingUser = null;
  }
}