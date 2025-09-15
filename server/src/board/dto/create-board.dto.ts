import { IsInt, IsString } from 'class-validator';

export class CreateBoardDto {
  @IsString()
  title: string;

  @IsInt()
  ownerId: number;
}
