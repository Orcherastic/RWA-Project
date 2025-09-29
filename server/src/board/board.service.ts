import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from './entities/board.entity';
import { User } from '../user/user.entity';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(Board)
    private readonly boardRepo: Repository<Board>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findBoardsByUser(userId: number): Promise<Board[]> {
    return this.boardRepo.find({
      where: { owner: { id: userId } },
      relations: ['owner'],
    });
  }

  async createBoard(title: string, userId: number): Promise<Board> {
    const owner = await this.userRepo.findOneBy({ id: userId });
    if (!owner) throw new NotFoundException('User not found');

    const board = this.boardRepo.create({ title, owner });
    return this.boardRepo.save(board);
  }

  async deleteBoard(boardId: number, userId: number): Promise<void> {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      relations: ['owner'],
    });
    if (!board) throw new NotFoundException('Board not found');
    if (board.owner.id !== userId) {
      throw new ForbiddenException('You are not allowed to delete this board');
    }

    await this.boardRepo.remove(board);
  }
}
