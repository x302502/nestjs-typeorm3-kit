import { Column, Entity, PrimaryGeneratedColumn, Repository } from "typeorm";
import { DefEntityRepository } from "../../..";

@Entity()
export class Author {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

@Entity()
export class Tag {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  value!: string;
}

@DefEntityRepository(Author)
export class AuthorRepo extends Repository<Author> {}

@DefEntityRepository(Tag)
export class TagRepo extends Repository<Tag> {}

// Not decorated: must be ignored by discovery.
export class PlainRepo extends Repository<Tag> {}

export const NOT_A_CLASS = "ignored";
