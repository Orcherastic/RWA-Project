import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { Board } from './board.entity';

@Entity()
export class BoardInvite {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Board, { onDelete: 'CASCADE' })
  board: Board;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  inviter: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  invitee: User;

  @Column({ default: 'pending' })
  status: 'pending' | 'accepted' | 'declined';

  @CreateDateColumn()
  createdAt: Date;
}
