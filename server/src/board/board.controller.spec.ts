import { Test, TestingModule } from '@nestjs/testing';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';

describe('BoardController', () => {
  let controller: BoardController;
  const boardServiceMock = {
    getMembers: jest.fn(),
    removeMember: jest.fn(),
    getBoardInvites: jest.fn(),
    cancelInvite: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoardController],
      providers: [
        {
          provide: BoardService,
          useValue: boardServiceMock,
        },
      ],
    }).compile();

    controller = module.get<BoardController>(BoardController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('maps getMembers to service with authenticated user id', async () => {
    boardServiceMock.getMembers.mockResolvedValue([{ id: 1 }]);
    const req = { user: { userId: 42, email: 'user@test.com' } } as any;

    const result = await controller.getMembers('12', req);

    expect(boardServiceMock.getMembers).toHaveBeenCalledWith(12, 42);
    expect(result).toEqual([{ id: 1 }]);
  });

  it('maps removeMember params to numeric service args', async () => {
    boardServiceMock.removeMember.mockResolvedValue({ message: 'Member removed' });
    const req = { user: { userId: 42, email: 'owner@test.com' } } as any;

    const result = await controller.removeMember('9', '7', req);

    expect(boardServiceMock.removeMember).toHaveBeenCalledWith(9, 7, 42);
    expect(result).toEqual({ message: 'Member removed' });
  });

  it('maps cancelInvite params to numeric service args', async () => {
    boardServiceMock.cancelInvite.mockResolvedValue({ message: 'Invite canceled' });
    const req = { user: { userId: 42, email: 'owner@test.com' } } as any;

    const result = await controller.cancelInvite('9', '99', req);

    expect(boardServiceMock.cancelInvite).toHaveBeenCalledWith(9, 99, 42);
    expect(result).toEqual({ message: 'Invite canceled' });
  });
});
