import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  private sanitize(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars
    const { password, ...rest } = user as any;
    return rest as Partial<User>;
  }

  async create(dto: CreateUserDto) {
    const plainPassword = dto.password || 'default123';
    const hashed = await bcrypt.hash(plainPassword, 10);

    const user = this.repo.create({ ...dto, password: hashed });
    const saved = await this.repo.save(user);
    return this.sanitize(saved);
  }

  async findAll() {
    const users = await this.repo.find();
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: number) {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.sanitize(user);
  }

  async findByEmail(email: string) {
    return this.repo.findOneBy({ email });
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new Error('User not found');

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    const updated = Object.assign(user, dto);
    const saved = await this.repo.save(updated);
    return this.sanitize(saved);
  }

  async remove(id: number) {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    await this.repo.remove(user);
    return { deleted: true };
  }
}
