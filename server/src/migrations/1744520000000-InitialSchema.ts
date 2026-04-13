import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1744520000000 implements MigrationInterface {
  name = 'InitialSchema1744520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" SERIAL NOT NULL,
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "displayName" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_email" UNIQUE ("email"),
        CONSTRAINT "PK_user_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "board" (
        "id" SERIAL NOT NULL,
        "title" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "content" json,
        "ownerId" integer,
        CONSTRAINT "PK_board_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "board_member" (
        "id" SERIAL NOT NULL,
        "boardId" integer,
        "userId" integer,
        CONSTRAINT "PK_board_member_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "board_invite" (
        "id" SERIAL NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "boardId" integer,
        "inviterId" integer,
        "inviteeId" integer,
        CONSTRAINT "PK_board_invite_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "board"
      ADD CONSTRAINT "FK_board_owner"
      FOREIGN KEY ("ownerId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "board_member"
      ADD CONSTRAINT "FK_board_member_board"
      FOREIGN KEY ("boardId") REFERENCES "board"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "board_member"
      ADD CONSTRAINT "FK_board_member_user"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "board_invite"
      ADD CONSTRAINT "FK_board_invite_board"
      FOREIGN KEY ("boardId") REFERENCES "board"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "board_invite"
      ADD CONSTRAINT "FK_board_invite_inviter"
      FOREIGN KEY ("inviterId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "board_invite"
      ADD CONSTRAINT "FK_board_invite_invitee"
      FOREIGN KEY ("inviteeId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "board_invite" DROP CONSTRAINT "FK_board_invite_invitee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "board_invite" DROP CONSTRAINT "FK_board_invite_inviter"`,
    );
    await queryRunner.query(
      `ALTER TABLE "board_invite" DROP CONSTRAINT "FK_board_invite_board"`,
    );
    await queryRunner.query(
      `ALTER TABLE "board_member" DROP CONSTRAINT "FK_board_member_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "board_member" DROP CONSTRAINT "FK_board_member_board"`,
    );
    await queryRunner.query(`ALTER TABLE "board" DROP CONSTRAINT "FK_board_owner"`);
    await queryRunner.query(`DROP TABLE "board_invite"`);
    await queryRunner.query(`DROP TABLE "board_member"`);
    await queryRunner.query(`DROP TABLE "board"`);
    await queryRunner.query(`DROP TABLE "user"`);
  }
}
