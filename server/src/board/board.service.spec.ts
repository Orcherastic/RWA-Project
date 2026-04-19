import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BoardService } from './board.service';

describe('BoardService', () => {
  let service: BoardService;
  const boardRepo = { findOne: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const boardMemberRepo = { findOne: jest.fn(), remove: jest.fn() };
  const boardInviteRepo = { findOne: jest.fn(), remove: jest.fn() };

  beforeEach(() => {
    service = new BoardService(
      boardRepo as any,
      userRepo as any,
      boardMemberRepo as any,
      boardInviteRepo as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('getMembers forbids users that are neither owner nor member', async () => {
    boardRepo.findOne.mockResolvedValue({
      owner: { id: 1 },
      members: [{ user: { id: 2 } }],
    });

    await expect(service.getMembers(10, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('removeMember removes membership when requested by board owner', async () => {
    boardRepo.findOne.mockResolvedValue({ id: 10, owner: { id: 1 } });
    boardMemberRepo.findOne.mockResolvedValue({
      id: 55,
      board: { id: 10 },
      user: { id: 2 },
    });
    boardMemberRepo.remove.mockResolvedValue(undefined);

    const result = await service.removeMember(10, 2, 1);

    expect(boardMemberRepo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 55 }),
    );
    expect(result).toEqual({ message: 'Member removed' });
  });

  it('cancelInvite throws when invite does not belong to board', async () => {
    boardRepo.findOne.mockResolvedValue({ id: 10, owner: { id: 1 } });
    boardInviteRepo.findOne.mockResolvedValue({
      id: 99,
      board: { id: 11 },
    });

    await expect(service.cancelInvite(10, 99, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
