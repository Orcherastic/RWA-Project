import { User } from '../../user/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { BoardMember } from './board-member.entity';

@Entity()
export class Board {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.boards, { onDelete: 'CASCADE' })
  owner: User;

  @Column({ type: 'json', nullable: true })
  content: string;

  @OneToMany(() => BoardMember, (member) => member.board, { cascade: true })
  members: BoardMember[];
}
