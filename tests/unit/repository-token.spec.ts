import "reflect-metadata";
import { Repository as TypeOrmRepository } from "typeorm";
import { getDefRepositoryToken, getEntityByRepository } from "../../src/repository/config/utils";
import { DefEntityRepository } from "../../src";

class Book {}
class Photo {}

@DefEntityRepository(Book)
class BookRepo extends TypeOrmRepository<Book> {}

@DefEntityRepository(Photo)
class PhotoRepo extends TypeOrmRepository<Photo> {}

class NakedRepo {}

describe("getDefRepositoryToken", () => {
  it("returns the repository class itself for default connection when it extends TypeOrmRepository", () => {
    expect(getDefRepositoryToken(BookRepo as any)).toBe(BookRepo);
    expect(getDefRepositoryToken(BookRepo as any, "default")).toBe(BookRepo);
  });

  it("prefixes with connection name for non-default string connections", () => {
    expect(getDefRepositoryToken(BookRepo as any, "secondary")).toBe(
      "secondary_BookRepo"
    );
  });

  it("falls back to ClassNameRepository token when class does not extend TypeOrmRepository", () => {
    expect(getDefRepositoryToken(NakedRepo as any)).toBe("NakedRepoRepository");
    expect(getDefRepositoryToken(NakedRepo as any, "secondary")).toBe(
      "secondary_NakedRepoRepository"
    );
  });

  it("uses DataSourceOptions.name as prefix when it is not the default", () => {
    const options: any = { name: "secondary", type: "postgres" };
    expect(getDefRepositoryToken(BookRepo as any, options)).toBe(
      "secondary_BookRepo"
    );
  });

  it("returns the class itself when DataSourceOptions has no name or default name", () => {
    expect(getDefRepositoryToken(BookRepo as any, { name: "default" } as any)).toBe(BookRepo);
    expect(getDefRepositoryToken(BookRepo as any, {} as any)).toBe(BookRepo);
  });

  it("throws when repository is empty", () => {
    expect(() => getDefRepositoryToken(null as any)).toThrow(
      /repository is not empty/
    );
  });
});

describe("getEntityByRepository", () => {
  it("returns the registered entity for a @DefEntityRepository class", () => {
    expect(getEntityByRepository(BookRepo as any)).toBe(Book);
    expect(getEntityByRepository(PhotoRepo as any)).toBe(Photo);
  });

  it("throws when repository has no @DefEntityRepository metadata", () => {
    expect(() => getEntityByRepository(NakedRepo as any)).toThrow(
      /undetermined entity/
    );
  });
});
