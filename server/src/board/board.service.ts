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
import { BoardInvite } from './entities/board-invite.entity';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(Board) private readonly boardRepo: Repository<Board>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(BoardMember)
    private readonly boardMemberRepo: Repository<BoardMember>,
    @InjectRepository(BoardInvite)
    private readonly boardInviteRepo: Repository<BoardInvite>,
  ) {}

  async findAllForUser(userId: number): Promise<Board[]> {
    return this.boardRepo
      .createQueryBuilder('board')
      .leftJoin('board.members', 'member')
      .leftJoin('member.user', 'memberUser')
      .leftJoin('board.owner', 'owner')
      .where('owner.id = :userId OR memberUser.id = :userId', { userId })
      .select([
        'board',
        'owner.id',
        'owner.email',
        'owner.displayName',
      ])
      .orderBy('board.createdAt', 'ASC')
      .getMany();
  }

  async findOneById(boardId: number, userId: number): Promise<Board> {
    const board = await this.boardRepo
      .createQueryBuilder('board')
      .leftJoin('board.owner', 'owner')
      .leftJoin('board.members', 'member')
      .leftJoin('member.user', 'memberUser')
      .where('board.id = :boardId', { boardId })
      .select([
        'board',
        'owner.id',
        'owner.email',
        'owner.displayName',
        'member.id',
        'memberUser.id',
      ])
      .getOne();
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
      relations: ['owner', 'members', 'members.user'],
    });
    if (!board) throw new NotFoundException('Board not found');
    if (board.owner.id !== ownerId)
      throw new ForbiddenException('Not your board');

    // find target user
    const targetUser = await this.userRepo.findOne({
      where: { email: targetUserEmail },
    });
    if (!targetUser) throw new NotFoundException('User not found');
    if (targetUser.id === board.owner.id) {
      throw new BadRequestException('Owner already has access to this board');
    }

    // check if already member
    const alreadyMember = board.members?.some(
      (m) => m.user.id === targetUser.id,
    );
    if (alreadyMember)
      throw new BadRequestException('User is already a member of this board');

    const existingInvite = await this.boardInviteRepo.findOne({
      where: {
        board: { id: boardId },
        invitee: { id: targetUser.id },
        status: 'pending',
      },
      relations: ['board', 'invitee'],
    });
    if (existingInvite) {
      throw new BadRequestException('User already has a pending invite');
    }

    const invite = this.boardInviteRepo.create({
      board,
      inviter: board.owner,
      invitee: targetUser,
      status: 'pending',
    });
    await this.boardInviteRepo.save(invite);

    return { message: `Invite sent to ${targetUser.email}` };
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

  async saveContent(boardId: number, content: string) {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
    });
    if (!board) throw new NotFoundException('Board not found');

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

  async leaveBoard(boardId: number, userId: number) {
    const board = await this.boardRepo.findOne({
      where: { id: boardId },
      relations: ['owner'],
    });
    if (!board) throw new NotFoundException('Board not found');
    if (board.owner.id === userId) {
      throw new BadRequestException('Owner cannot leave their own board');
    }

    const membership = await this.boardMemberRepo.findOne({
      where: { board: { id: boardId }, user: { id: userId } },
      relations: ['board', 'user'],
    });
    if (!membership) {
      throw new NotFoundException('You are not a member of this board');
    }
    await this.boardMemberRepo.remove(membership);
    return { message: 'Left board' };
  }

  async getPendingInvites(userId: number): Promise<BoardInvite[]> {
    return this.boardInviteRepo
      .createQueryBuilder('invite')
      .leftJoin('invite.board', 'board')
      .leftJoin('board.owner', 'owner')
      .leftJoin('invite.inviter', 'inviter')
      .leftJoin('invite.invitee', 'invitee')
      .where('invitee.id = :userId', { userId })
      .andWhere('invite.status = :status', { status: 'pending' })
      .select([
        'invite',
        'board.id',
        'board.title',
        'owner.id',
        'owner.email',
        'owner.displayName',
        'inviter.id',
        'inviter.email',
        'inviter.displayName',
      ])
      .orderBy('invite.createdAt', 'ASC')
      .getMany();
  }

  async acceptInvite(inviteId: number, userId: number) {
    const invite = await this.boardInviteRepo.findOne({
      where: { id: inviteId },
      relations: ['board', 'invitee', 'board.owner', 'board.members', 'board.members.user'],
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.invitee.id !== userId)
      throw new ForbiddenException('Not your invite');
    if (invite.status !== 'pending')
      throw new BadRequestException('Invite already processed');

    const alreadyMember = invite.board.members?.some(
      (m) => m.user.id === userId,
    );
    if (!alreadyMember) {
      const newMember = this.boardMemberRepo.create({
        board: invite.board,
        user: invite.invitee,
      });
      await this.boardMemberRepo.save(newMember);
    }

    invite.status = 'accepted';
    await this.boardInviteRepo.save(invite);
    return { message: 'Invite accepted' };
  }

  async declineInvite(inviteId: number, userId: number) {
    const invite = await this.boardInviteRepo.findOne({
      where: { id: inviteId },
      relations: ['invitee'],
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.invitee.id !== userId)
      throw new ForbiddenException('Not your invite');
    if (invite.status !== 'pending')
      throw new BadRequestException('Invite already processed');

    invite.status = 'declined';
    await this.boardInviteRepo.save(invite);
    return { message: 'Invite declined' };
  }
}
