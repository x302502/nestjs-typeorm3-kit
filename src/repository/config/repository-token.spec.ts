import "reflect-metadata";
import { Repository as TypeOrmRepository, DataSourceOptions } from "typeorm";
import {
  getDefRepositoryToken,
  getEntityByRepository,
} from "./utils";
import { DefEntityRepository, InjectRepo } from "../..";
import type { Repository } from "./types";

class Book {}
class Photo {}

@DefEntityRepository(Book)
class BookRepo extends TypeOrmRepository<Book> {}

@DefEntityRepository(Photo)
class PhotoRepo extends TypeOrmRepository<Photo> {}

class NakedRepo {}

const bookRepo = BookRepo as unknown as Repository;
const photoRepo = PhotoRepo as unknown as Repository;
const nakedRepo = NakedRepo as unknown as Repository;

describe("getDefRepositoryToken", () => {
  it("returns the repository class itself for default connection when it extends TypeOrmRepository", () => {
    expect(getDefRepositoryToken(bookRepo)).toBe(BookRepo);
    expect(getDefRepositoryToken(bookRepo, "default")).toBe(BookRepo);
    expect(getDefRepositoryToken(bookRepo, undefined)).toBe(BookRepo);
  });

  it("handles nullish data source safely without throwing", () => {
    expect(getDefRepositoryToken(bookRepo, null as unknown as string)).toBe(BookRepo);
  });

  it("prefixes with connection name for non-default string connections", () => {
    expect(getDefRepositoryToken(bookRepo, "secondary")).toBe(
      "secondary_BookRepo"
    );
  });

  it("falls back to ClassNameRepository token when class does not extend TypeOrmRepository", () => {
    expect(getDefRepositoryToken(nakedRepo)).toBe("NakedRepoRepository");
    expect(getDefRepositoryToken(nakedRepo, "secondary")).toBe(
      "secondary_NakedRepoRepository"
    );
  });

  it("uses DataSourceOptions.name as prefix when it is not the default", () => {
    const options = { name: "secondary", type: "postgres" } as unknown as DataSourceOptions;
    expect(getDefRepositoryToken(bookRepo, options)).toBe(
      "secondary_BookRepo"
    );
  });

  it("returns the class itself when DataSourceOptions has no name or default name", () => {
    const defaultOptions = { name: "default" } as unknown as DataSourceOptions;
    const emptyOptions = {} as unknown as DataSourceOptions;
    expect(getDefRepositoryToken(bookRepo, defaultOptions)).toBe(BookRepo);
    expect(getDefRepositoryToken(bookRepo, emptyOptions)).toBe(BookRepo);
  });

  it("throws when repository is empty", () => {
    expect(() => getDefRepositoryToken(null as unknown as Repository)).toThrow(
      /repository is not empty/
    );
  });
});

describe("getEntityByRepository", () => {
  it("returns the registered entity for a @DefEntityRepository class", () => {
    expect(getEntityByRepository(bookRepo)).toBe(Book);
    expect(getEntityByRepository(photoRepo)).toBe(Photo);
  });

  it("throws when repository has no @DefEntityRepository metadata", () => {
    expect(() => getEntityByRepository(nakedRepo)).toThrow(
      /undetermined entity/
    );
  });
});

