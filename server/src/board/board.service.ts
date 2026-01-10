import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from './entities/board.entity';
import { User } from '../user/user.entity';
import { BoardMember } from './entities/board-member.entity';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(Board) private readonly boardRepo: Repository<Board>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(BoardMember)
    private readonly boardMemberRepo: Repository<BoardMember>,
  ) {}

  async findAllForUser(userId: number): Promise<Board[]> {
    return this.boardRepo.find({
      where: [
        { owner: { id: userId } },
        { members: { user: { id: userId } } },
      ],
      relations: ['owner', 'members'],
    });
  }

  async findOneById(boardId: number, userId: number): Promise<Board> {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      relations: ['owner', 'members', 'members.user'],
    });
    if (!board) throw new NotFoundException('Board not found');

    // Check ownership or membership
    const isOwner = board.owner.id === userId;
    const isMember = board.members.some((m) => m.user.id === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this board');
    }

    return board;
  }

  async createBoard(title: string, userId: number): Promise<Board> {
    const owner = await this.userRepo.findOneBy({ id: userId });
    if (!owner) throw new NotFoundException('User not found');

    const board = this.boardRepo.create({ title, owner });
    return this.boardRepo.save(board);
  }

  async shareBoard(boardId: number, targetUserEmail: string, ownerId: number) {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      relations: ['owner', 'members'],
    });
    if (!board) throw new NotFoundException('Board not found');
    if (board.owner.id !== ownerId)
      throw new ForbiddenException('Not your board');

    // find target user
    const targetUser = await this.userRepo.findOne({
      where: { email: targetUserEmail },
    });
    if (!targetUser) throw new NotFoundException('User not found');

    // check if already member
    const alreadyMember = board.members?.some(
      (m) => m.user.id === targetUser.id,
    );
    if (alreadyMember)
      throw new BadRequestException('User is already a member of this board');

    // create membership
    const newMember = this.boardMemberRepo.create({ board, user: targetUser });
    await this.boardMemberRepo.save(newMember);

    return { message: `Board shared with ${targetUser.email}` };
  }

  async updateTitle(boardId: number, newTitle: string, userId: number) {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      relations: ['owner'],
    });

    if (!board) throw new NotFoundException('Board not found');
    if (board.owner.id !== userId)
      throw new ForbiddenException('Not your board');

    board.title = newTitle;
    return this.boardRepo.save(board);
  }

  async updateContent(boardId: number, content: string, userId: number) {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      relations: ['owner', 'members', 'members.user'],
    });

    if (!board) throw new NotFoundException('Board not found');

    const isOwner = board.owner.id === userId;
    const isMember = board.members.some((m) => m.user.id === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this board');
  }

  board.content = content;
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
