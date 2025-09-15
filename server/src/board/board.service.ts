import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from './entities/board.entity';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { User } from '../user/user.entity';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateBoardDto) {
    const user = await this.userRepo.findOneBy({ id: dto.ownerId });
    if (!user) throw new Error('User not found');
    const board = this.boardRepo.create({ title: dto.title, owner: user });
    return this.boardRepo.save(board);
  }

  findAll() {
    return this.boardRepo.find({ relations: ['owner'] });
  }

  findOne(id: number) {
    return this.boardRepo.findOne({ where: { id }, relations: ['owner'] });
  }

  async update(id: number, dto: UpdateBoardDto) {
    await this.boardRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.boardRepo.delete(id);
    return { deleted: true };
  }
}
