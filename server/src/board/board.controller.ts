import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Req,
  Patch,
  Put,
} from '@nestjs/common';
import { BoardService } from './board.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';

interface AuthRequest extends Request {
  user: { userId: number; email: string };
}

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get()
  async findAll(@Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.findAllForUser(userId);
  }

  @Get('invites')
  async getInvites(@Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.getPendingInvites(userId);
  }

  @Post('invites/:id/accept')
  async acceptInvite(@Param('id') id: string, @Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.acceptInvite(Number(id), userId);
  }

  @Post('invites/:id/decline')
  async declineInvite(@Param('id') id: string, @Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.declineInvite(Number(id), userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.findOneById(Number(id), userId);
  }

  @Post()
  async create(@Body('title') title: string, @Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.createBoard(title, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/share')
  async shareBoard(
    @Param('id') boardId: string,
    @Body() body: { email: string },
    @Req() req: AuthRequest,
  ) {
    const userId = req.user.userId;
    return this.boardService.shareBoard(Number(boardId), body.email, userId);
  }

  @Patch(':id')
  async updateTitle(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { title: string },
  ) {
    const userId = req.user.userId;
    return this.boardService.updateTitle(+id, body.title, userId);
  }

  @Put(':id/content')
  async updateBoardContent(
    @Param('id') id: string,
    @Body('content') content: string,
    @Req() req: AuthRequest,
  ) {
    const userId = req.user.userId;
    return this.boardService.updateContent(Number(id), content, userId);
  }

  @Post(':id/leave')
  async leaveBoard(@Param('id') id: string, @Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.leaveBoard(Number(id), userId);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.boardService.deleteBoard(id, req.user.userId);
  }
}
