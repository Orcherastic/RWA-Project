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
} from '@nestjs/common';
import { BoardService } from './board.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { userId: number; email: string };
}

@Controller('boards')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  // eslint-disable-next-line @typescript-eslint/require-await
  async findAll(@Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.findAllForUser(userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body('title') title: string, @Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.boardService.createBoard(title, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateTitle(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { title: string },
  ) {
    const userId = req.user.userId;
    return this.boardService.updateTitle(+id, body.title, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: number, @Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.boardService.deleteBoard(id, req.user.userId);
  }
}
