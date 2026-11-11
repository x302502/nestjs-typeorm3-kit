# Repository pattern & multi-DataSource

[← Back to docs index](../README.md) · [Tiếng Việt](../vi/repository.md)

This page covers everything related to defining repositories, wiring them into Nest modules, injecting them into services, and the safer `findOne` provided by `RepositoryWrapper`.

## Overview

TypeORM 0.3 removed the `@EntityRepository()` decorator that made custom repositories ergonomic. `nestjs-typeorm3-kit` brings that pattern back with:

- `@DefEntityRepository(Entity)` — marks a class as a custom repository for an entity.
- `DefRepositoryModule` — Nest module that auto-discovers repositories and registers them as DI providers.
- `@InjectRepo(Repo, dataSource?)` — inject by class, optionally targeting a non-default DataSource.
- `RepositoryWrapper` — `Repository` subclass that hardens `findOne` against TypeORM's "first row on undefined where" footgun.

## Quick example

```ts
// book.entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Book {
  @PrimaryGeneratedColumn() id!: number;
  @Column() title!: string;
}
```

```ts
// book.repo.ts
import { DefEntityRepository, RepositoryWrapper } from "nestjs-typeorm3-kit";
import { Book } from "./book.entity";

@DefEntityRepository(Book)
export class BookRepo extends RepositoryWrapper<Book> {
  findByTitle(title: string) {
    return this.findOne({ where: { title } });
  }
}
```

```ts
// repo.module.ts
import { Module } from "@nestjs/common";
import { join } from "path";
import { DefRepositoryModule } from "nestjs-typeorm3-kit";

@Module({
  imports: [
    DefRepositoryModule.forRootAsync({
      useFactory: () => ({
        globPattern: join(__dirname, "./**/*.repo.{ts,js}"),
      }),
    }),
  ],
  exports: [DefRepositoryModule],
})
export class RepoModule {}
```

```ts
// book.service.ts
import { Injectable } from "@nestjs/common";
import { BookRepo } from "./book.repo";

@Injectable()
export class BookService {
  constructor(readonly bookRepo: BookRepo) {} // default connection
}
```

## API reference

### `@DefEntityRepository(entity)`

Marks a class as a TypeORM repository for a given entity. The class **must** extend either `Repository<Entity>` (from `typeorm`) or `RepositoryWrapper<Entity>` (from this kit).

**Signature**

```ts
function DefEntityRepository(target: EntityTarget<ObjectLiteral>): ClassDecorator;
```

**Parameters**

| Name     | Type                            | Required | Description                                                                     |
| -------- | ------------------------------- | :------: | ------------------------------------------------------------------------------- |
| `target` | `EntityTarget<ObjectLiteral>`   |    ✔     | The entity class (or table reference) this repository operates on.              |

**How it works.** The decorator stores `target` on the class constructor via `Reflect.defineMetadata(ENTITY_METADATA_KEY, target, Constructor)`. `DefRepositoryModule` later reads this metadata to discover which entity to bind the repository to when constructing the provider.

**Pitfalls**

- Forgetting the decorator → glob discovery (`forRoot`/`forRootAsync`) silently ignores the class because it doesn't have the metadata key, and you'll get `UnknownDependencyException` at runtime. `forFeature` throws `Repository: <Name> undetermined entity` instead.
- Decorating a class that does not extend `Repository` → the module still calls `new YourClass(entity, manager, queryRunner)`, so you get your own class without any TypeORM methods, registered under the string token `"<ClassName>Repository"` instead of the class.

---

### `RepositoryWrapper<Entity>`

A subclass of `TypeOrmRepository<Entity>` that overrides `findOne` to return `null` instead of accidentally returning the **first row of the table** when the `where` clause has any `undefined` value.

**Why this matters.** `TypeORM.findOne({ where: { id: undefined } })` strips the `id` because `undefined` is not serialisable, leaving an empty `WHERE` clause. The query then returns whatever row TypeORM finds first — a footgun that can cause auth bypasses (`findOne({ where: { id: req.user?.id } })` returning admin row).

**Behaviour**

`findOne(options?)` returns `null` when any of the following is true:

1. `options` is missing or not an object.
2. `options.where` is missing, `null`, or not an object.
3. `options.where` is empty (`{}`, `[]`, or an OR array containing `{}`).
4. A mapped column, relation, or embedded predicate is `undefined`, or a nested relation/embedded condition is empty.

Otherwise it delegates to the original `Repository.findOne`.

**Example**

```ts
export class BaseRepo<Entity> extends RepositoryWrapper<Entity> {}

@DefEntityRepository(Book)
export class BookRepo extends BaseRepo<Book> {}

await bookRepo.findOne({ where: { id: undefined } }); // → null (safe)
await bookRepo.findOne({ where: { id: 1 } });          // → Book | null (normal)
await bookRepo.findOne();                              // → null
await bookRepo.findOne({ where: {} });                 // → null (no filter)
await bookRepo.findOne({ where: [{}, { id: 1 }] });     // → null (unsafe OR branch)
await bookRepo.findOne({ where: { author: { id: undefined } } }); // → null
```

**Pitfalls**

- Empty top-level or nested relation/embedded conditions return `null`; mapped `undefined` values are blocked in every OR branch. Valid predicates still use TypeORM's `findOne`.
- If you legitimately want TypeORM's old behaviour, extend `Repository` directly instead of `RepositoryWrapper`.

---

### `DefRepositoryModule`

The Nest dynamic module that scans for `@DefEntityRepository`-decorated classes and registers them as providers, with their token derived from the class itself (default connection) or `<connectionName>_<ClassName>` (non-default).

Three registration styles, pick whichever suits your bootstrap flow.

#### `DefRepositoryModule.forFeature(repositories, dataSource?)`

Explicitly enumerate repository classes. Useful for small modules or when you do not want a glob scan.

**Signature**

```ts
DefRepositoryModule.forFeature(
  repositories: Repository[],
  dataSource?: string | DataSource | DataSourceOptions,
): DynamicModule;
```

**Parameters**

| Name           | Type                                          | Required | Default     | Description                                                            |
| -------------- | --------------------------------------------- | :------: | ----------- | ---------------------------------------------------------------------- |
| `repositories` | `Repository[]`                                |    ✔     | —           | List of repository classes (decorated with `@DefEntityRepository`).    |
| `dataSource`   | `string \| DataSource \| DataSourceOptions`   |          | `"default"` | DataSource name (string) or DataSource/options object.                 |

**Example**

```ts
@Module({
  imports: [
    DefRepositoryModule.forFeature([BookRepo, AuthorRepo]),
    DefRepositoryModule.forFeature([LogRepo], "secondary"),
  ],
})
export class CombinedModule {}
```

#### `DefRepositoryModule.forRoot(options)`

Glob-based registration; returns a `Promise<DynamicModule>` because the glob must be resolved before the module is built. Neither `forRoot` nor `forRootAsync` can use Nest DI; choose `forRootAsync` when the options come from a factory or options class, or the module needs extra `imports`.

**Signature**

```ts
DefRepositoryModule.forRoot(options: DefRepositoryModuleOptions): Promise<DynamicModule>;
```

#### `DefRepositoryModule.forRootAsync(options)`

Glob-based custom registration. Options must be resolved before Nest bootstraps, because discovery determines which repository tokens are available to its DI container.

**Signature**

```ts
DefRepositoryModule.forRootAsync(options: DefRepositoryModuleAsyncOptions): Promise<DynamicModule>;
```

**`DefRepositoryModuleAsyncOptions`**

| Field        | Type                                                     | Required | Description                                                       |
| ------------ | -------------------------------------------------------- | :------: | ----------------------------------------------------------------- |
| `imports`    | `ModuleMetadata["imports"]`                              |          | Modules imported by the resulting dynamic module.                |
| `useFactory` | `() => DefRepositoryModuleOptions \| Promise<...>`        | ✔ *      | Dependency-free factory, called once before Nest bootstrap.      |
| `useClass`   | `Type<DefRepositoryOptionsFactory>`                      | ✔ *      | Dependency-free class, constructed once before Nest bootstrap.   |

* Specify either `useFactory` or `useClass`. `inject` and `useExisting` are not
supported: Nest providers do not exist yet when the glob and tokens are created.

**`DefRepositoryModuleOptions`**

| Field         | Type                                          | Required | Default     | Description                                                              |
| ------------- | --------------------------------------------- | :------: | ----------- | ------------------------------------------------------------------------ |
| `globPattern` | `string`                                      |    ✔     | —           | **Absolute** glob used to find `*.repo.ts` / `*.repo.js` files.          |
| `dataSource`  | `string \| DataSource \| DataSourceOptions`   |          | `"default"` | DataSource name. Determines the injection token for each repository.     |

**Example without ConfigService**

```ts
DefRepositoryModule.forRootAsync({
  useFactory: async () => ({
    globPattern: join(__dirname, "./**/*.repo.{ts,js}"),
    dataSource: "default",
  }),
});
```

**Glob notes**

- The glob is rewritten with `\` → `/` automatically for Windows.
- Only files whose **exported classes** carry `ENTITY_METADATA_KEY` (set by `@DefEntityRepository`) are registered; other exports are ignored.
- Make the glob absolute (use `join(__dirname, …)`). A relative glob resolves from `process.cwd()` which is rarely what you want in a Nest app.

---

### `@InjectRepo(repository, dataSource?)`

DI helper that resolves to the correct provider token for a repository class on a given connection. For the **default** connection, the token is the class itself, so you can also use plain constructor injection.

**Signature**

```ts
function InjectRepo(
  repository: Repository,
  dataSource?: string | DataSource | DataSourceOptions,
): PropertyDecorator & ParameterDecorator;
```

**Parameters**

| Name         | Type                                          | Required | Default     | Description                                       |
| ------------ | --------------------------------------------- | :------: | ----------- | ------------------------------------------------- |
| `repository` | `Repository`                                  |    ✔     | —           | The repository class.                             |
| `dataSource` | `string \| DataSource \| DataSourceOptions`   |          | `"default"` | DataSource name to scope the injection to.        |

**Token rules** (this is what `@InjectRepo` resolves under the hood)

| Connection                              | Repository extends `Repository`? | Token                                  |
| --------------------------------------- | -------------------------------- | -------------------------------------- |
| `"default"`                             | Yes                              | The repository class itself.           |
| `"default"`                             | No                               | `"<ClassName>Repository"`              |
| Named (e.g. `"secondary"`)              | Yes                              | `"<connectionName>_<ClassName>"`       |
| Named                                   | No                               | `"<connectionName>_<ClassName>Repository"` |

**Example — multi-connection service**

```ts
@Injectable()
export class DemoService {
  constructor(
    readonly bookRepo: BookRepo,                                  // default connection
    @InjectRepo(BookRepo, "secondary") readonly bookRepo2: BookRepo, // same class, secondary DB
    @InjectRepo(LogRepo, "secondary") readonly logRepo: LogRepo,
  ) {}
}
```

**Pitfalls**

- For the default connection you can rely on plain constructor injection. For named connections you **must** use `@InjectRepo` because the token is namespaced.
- Passing a `DataSourceOptions` object with no `name` falls back to the default connection name.

## Patterns

### Defining a base repo with shared helpers

```ts
import { DeepPartial, FindOneOptions, SaveOptions } from "typeorm";
import { RepositoryWrapper } from "nestjs-typeorm3-kit";

export class BaseRepo<Entity> extends RepositoryWrapper<Entity> {
  async findOrCreate(value: Partial<Entity>, options?: FindOneOptions<Entity>) {
    const found = await this.findOne(options);
    return found ?? (await this.save(value as DeepPartial<Entity>));
  }
  async saves(entities: DeepPartial<Entity>[], options: SaveOptions = {}) {
    return this.save(entities, { reload: true, chunk: 10_000, ...options });
  }
}
```

Then have every concrete repo extend `BaseRepo<E>` instead of the raw `Repository<E>`.

### Switching the active connection at runtime

`DefRepositoryModule` resolves the DataSource name at module-init time, so the connection per provider is fixed. To pick a connection at request time, either inject both providers and choose in code, or expose a request-scoped factory that returns the right repository.
