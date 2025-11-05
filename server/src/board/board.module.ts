import { Module } from '@nestjs/common';
import { BoardService } from './board.service';
import { BoardController } from './board.controller';
import { BoardGateway } from './board.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entities/board.entity';
import { User } from '../user/user.entity';
import { BoardMember } from './entities/board-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Board, User, BoardMember])],
  controllers: [BoardController],
  providers: [BoardService, BoardGateway],
})
export class BoardModule {}
