import { Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getDataSourceToken, TypeOrmModule } from "@nestjs/typeorm";
import { resolve } from "path";
import "reflect-metadata";
import type { DataSource } from "typeorm";
import { DEF_REPOSITORY_OPTIONS, InjectRepo, loadRepositoriesFromPath } from "../..";
import { DefRepositoryModule } from ".";
import { AsyncItemRepo } from "./__fixtures__/async-item.repo";
import { Author, AuthorRepo, Tag, TagRepo } from "./__fixtures__/multi.repo";

const fixtures = resolve(process.cwd(), "src/repository/module/__fixtures__");

type FactoryProvider = { provide: unknown; inject: unknown[]; useFactory: (ds: unknown) => unknown };
const providersOf = (module: { providers?: unknown[] }) =>
  (module.providers ?? []) as FactoryProvider[];

describe("loadRepositoriesFromPath", () => {
  it("collects every @DefEntityRepository class exported by matching files, once", async () => {
    const repositories = await loadRepositoriesFromPath(`${fixtures}/*.repo.ts`);
    expect(repositories).toHaveLength(3);
    expect(repositories).toEqual(expect.arrayContaining([AsyncItemRepo, AuthorRepo, TagRepo]));
  });

  it("ignores undecorated exports", async () => {
    const repositories = await loadRepositoriesFromPath(`${fixtures}/multi.repo.ts`);
    expect(repositories).toEqual([AuthorRepo, TagRepo]);
  });

  it("accepts Windows-style separators", async () => {
    const repositories = await loadRepositoriesFromPath(
      `${fixtures}/multi.repo.ts`.replace(/\//g, "\\")
    );
    expect(repositories).toEqual([AuthorRepo, TagRepo]);
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await loadRepositoriesFromPath(`${fixtures}/*.missing.ts`)).toEqual([]);
  });
});

describe("DefRepositoryModule.forFeature", () => {
  it("defaults to no providers", () => {
    expect(DefRepositoryModule.forFeature()).toEqual({
      module: DefRepositoryModule,
      providers: [],
      exports: [],
    });
  });

  it("deduplicates repositories and exports every provider", () => {
    const module = DefRepositoryModule.forFeature([AuthorRepo, TagRepo, AuthorRepo]);
    expect(providersOf(module).map(p => p.provide)).toEqual([AuthorRepo, TagRepo]);
    expect(module.exports).toEqual(module.providers);
  });

  it("uses named tokens and injects the named DataSource", () => {
    const [provider] = providersOf(DefRepositoryModule.forFeature([AuthorRepo], "analytics"));
    expect(provider.provide).toBe("analytics_AuthorRepo");
    expect(provider.inject).toEqual([getDataSourceToken("analytics")]);
  });

  it("builds the repository for its entity with the DataSource manager", () => {
    const [provider] = providersOf(DefRepositoryModule.forFeature([TagRepo]));
    const manager = { queryRunner: undefined };
    const repository = provider.useFactory({ manager } as unknown as DataSource) as TagRepo;
    expect(repository).toBeInstanceOf(TagRepo);
    expect(repository.target).toBe(Tag);
    expect(repository.manager).toBe(manager);
  });

  it("throws for a repository without @DefEntityRepository", () => {
    class Naked {}
    expect(() => DefRepositoryModule.forFeature([Naked as never]))
      .toThrow(/Naked undetermined entity/);
  });
});

describe("DefRepositoryModule.forRoot", () => {
  it("registers discovered repositories for the configured DataSource", async () => {
    const module = await DefRepositoryModule.forRoot({
      globPattern: `${fixtures}/multi.repo.ts`,
      dataSource: "reporting",
    });
    expect(module.module).toBe(DefRepositoryModule);
    expect(providersOf(module).map(p => p.provide))
      .toEqual(["reporting_AuthorRepo", "reporting_TagRepo"]);
    expect(module.exports).toEqual(module.providers);
  });

  it("requires a globPattern", async () => {
    await expect(DefRepositoryModule.forRoot(undefined as never)).rejects.toThrow(/valid globPattern/);
    await expect(DefRepositoryModule.forRoot({ globPattern: "" })).rejects.toThrow(/valid globPattern/);
  });

  it("injects discovered repositories into a running app", async () => {
    @Injectable()
    class AuthorService {
      constructor(@InjectRepo(AuthorRepo) readonly authors: AuthorRepo) {}
    }

    @Module({
      imports: [
        TypeOrmModule.forRoot({ type: "sqljs", entities: [Author, Tag], synchronize: true }),
        await DefRepositoryModule.forRoot({ globPattern: `${fixtures}/multi.repo.ts` }),
      ],
      providers: [AuthorService],
    })
    class AppModule {}

    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      await app.init();
      const { authors } = app.get(AuthorService);
      await authors.save({ name: "Tolkien" });
      expect(await authors.findOneBy({ name: "Tolkien" })).toMatchObject({ id: 1 });
    } finally {
      await app.close();
    }
  });
});

describe("DefRepositoryModule.forRootAsync", () => {
  it("exposes the resolved options and keeps extra imports", async () => {
    @Module({})
    class ExtraModule {}
    const options = { globPattern: `${fixtures}/multi.repo.ts`, dataSource: "reporting" };
    const module = await DefRepositoryModule.forRootAsync({
      imports: [ExtraModule],
      useFactory: () => options,
    });
    expect(module.imports).toEqual([ExtraModule]);
    expect(module.providers?.[0]).toEqual({ provide: DEF_REPOSITORY_OPTIONS, useValue: options });
    expect(module.exports).toHaveLength(2);
    expect(module.exports).not.toContainEqual(module.providers?.[0]);
  });

  it("defaults imports to an empty list", async () => {
    const module = await DefRepositoryModule.forRootAsync({
      useFactory: () => ({ globPattern: `${fixtures}/multi.repo.ts` }),
    });
    expect(module.imports).toEqual([]);
  });

  it("requires useFactory or useClass", async () => {
    await expect(DefRepositoryModule.forRootAsync({})).rejects.toThrow(/useClass or useFactory/);
  });
});
