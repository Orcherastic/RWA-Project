import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { User } from '../user/user.entity';
import { Board } from '../board/entities/board.entity';
import { BoardMember } from '../board/entities/board-member.entity';
import { BoardInvite } from '../board/entities/board-invite.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'whiteboard',
  password: process.env.DB_PASSWORD ?? 'secret',
  database: process.env.DB_NAME ?? 'whiteboarddb',
  entities: [User, Board, BoardMember, BoardInvite],
  migrations: [join(__dirname, '../migrations/*{.ts,.js}')],
  synchronize: false,
});
