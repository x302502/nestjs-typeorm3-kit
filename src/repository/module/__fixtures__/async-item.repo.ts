import { Column, Entity, PrimaryGeneratedColumn, Repository } from "typeorm";
import { DefEntityRepository } from "../../..";

@Entity()
export class AsyncItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  label!: string;
}

@DefEntityRepository(AsyncItem)
export class AsyncItemRepo extends Repository<AsyncItem> {}
