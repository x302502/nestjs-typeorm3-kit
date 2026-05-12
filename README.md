# nestjs-typeorm3-kit

[![npm](https://img.shields.io/npm/v/nestjs-typeorm3-kit)](https://www.npmjs.com/package/nestjs-typeorm3-kit) ![MIT License](https://img.shields.io/npm/l/nestjs-typeorm3-kit.svg)

A toolkit for [NestJS](https://nestjs.com/) + [TypeORM](https://typeorm.io) **0.3+** that brings back the ergonomic `@EntityRepository` pattern that TypeORM 0.3 removed, plus transactional, Swagger, and controller helpers.

- ✅ `@DefEntityRepository` — the closest thing to TypeORM 0.2's `@EntityRepository`
- ✅ `@InjectRepo` with **multi-DataSource** support out of the box
- ✅ `@DefTransaction` — decorator-based transactions (wraps `typeorm-transactional`)
- ✅ `RepositoryWrapper` — hardens `findOne` against TypeORM's "first row on undefined where" footgun
- ✅ `@DefController`, `@DefGet/Post/Put/Patch/Delete` — less boilerplate, auto Swagger response metadata
- ✅ `@ChildModule` — nested route prefixes + auto `ApiTags`
- ✅ `configSwaggerDocument` — merges `class-validator` metadata into the OpenAPI doc
- ✅ `lazyLoadClasses` — auto-discover controllers/services by file suffix

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Repository API](#repository-api)
   - [`@DefEntityRepository`](#defentityrepository)
   - [`DefRepositoryModule`](#defrepositorymodule)
   - [`@InjectRepo`](#injectrepo)
   - [`RepositoryWrapper`](#repositorywrapper)
4. [Transactions](#transactions)
   - [`setupTransactionContext`](#setuptransactioncontext)
   - [`@DefTransaction`](#deftransaction)
5. [Controller & module helpers](#controller--module-helpers)
   - [`@DefController` and method decorators](#defcontroller-and-method-decorators)
   - [`@ChildModule`](#childmodule)
6. [Swagger helper](#swagger-helper)
7. [Validation decorators](#validation-decorators)
8. [Utilities](#utilities)
9. [Full example](#full-example)
10. [Testing](#testing)
11. [Compatibility](#compatibility)
12. [Troubleshooting](#troubleshooting)

---

## Installation

```bash
npm install nestjs-typeorm3-kit typeorm-transactional
# or
yarn add nestjs-typeorm3-kit typeorm-transactional
# or
pnpm add nestjs-typeorm3-kit typeorm-transactional
```

Peer dependencies (install if you don't already have them):

```bash
npm install @nestjs/common @nestjs/core @nestjs/typeorm typeorm reflect-metadata rxjs class-validator class-transformer
```

---

## Quick start

```ts
// main.ts
import { NestFactory } from "@nestjs/core";
import { setupTransactionContext } from "nestjs-typeorm3-kit";
import { AppModule } from "./app.module";

async function bootstrap() {
  setupTransactionContext(); // MUST be called BEFORE NestFactory.create
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

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
import { Repository } from "typeorm";
import { DefEntityRepository } from "nestjs-typeorm3-kit";
import { Book } from "./book.entity";

@DefEntityRepository(Book)
export class BookRepo extends Repository<Book> {
  findByTitle(title: string) {
    return this.findOne({ where: { title } });
  }
}
```

```ts
// book.module.ts
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
export class BookRepoModule {}
```

```ts
// book.service.ts
import { Injectable } from "@nestjs/common";
import { DefTransaction, InjectRepo } from "nestjs-typeorm3-kit";
import { BookRepo } from "./book.repo";

@Injectable()
export class BookService {
  // when using the default connection, plain constructor injection also works
  constructor(@InjectRepo(BookRepo) private readonly repo: BookRepo) {}

  @DefTransaction()
  async create(title: string) {
    return this.repo.save({ title });
  }
}
```

---

## Repository API

### `@DefEntityRepository`

Marks a class as a TypeORM repository bound to an entity — similar to TypeORM 0.2's `@EntityRepository`. Your class should extend `Repository<Entity>` (or `RepositoryWrapper<Entity>` — see below).

```ts
import { Repository } from "typeorm";
import { DefEntityRepository } from "nestjs-typeorm3-kit";

@DefEntityRepository(Book)
export class BookRepo extends Repository<Book> {
  findPublished() {
    return this.find({ where: { published: true } });
  }
}
```

Under the hood, the decorator just stores the entity on the class via `Reflect.defineMetadata`. `DefRepositoryModule` reads that metadata to wire up providers.

### `DefRepositoryModule`

Registers repository providers for one or more DataSources. Three registration styles:

#### `forFeature(repositories, dataSource?)` — explicit list

```ts
import { DefRepositoryModule } from "nestjs-typeorm3-kit";

@Module({
  imports: [DefRepositoryModule.forFeature([BookRepo, AuthorRepo])],
  exports: [DefRepositoryModule],
})
export class PrimaryRepoModule {}
```

#### `forRoot({ globPattern, dataSource? })` — glob-based sync

```ts
@Module({
  imports: [
    DefRepositoryModule.forRoot({
      globPattern: join(__dirname, "./**/*.repo.{ts,js}"),
    }),
  ],
})
export class PrimaryRepoModule {}
```

> **Note:** `forRoot` returns a `Promise<DynamicModule>` — if your bootstrap needs sync modules, use `forRootAsync`.

#### `forRootAsync({ useFactory | useClass | useExisting })` — DI-based

```ts
@Module({
  imports: [
    DefRepositoryModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        globPattern: join(__dirname, "./**/*.repo.{ts,js}"),
        dataSource: cfg.get("DB_CONNECTION"),
      }),
    }),
  ],
})
export class PrimaryRepoModule {}
```

**`DefRepositoryModuleOptions`**

| Field         | Type                                               | Required | Description                                                                   |
| ------------- | -------------------------------------------------- | :------: | ----------------------------------------------------------------------------- |
| `globPattern` | `string`                                           |    ✔     | Absolute glob used to discover `*.repo.ts` / `*.repo.js` files.               |
| `dataSource`  | `string \| DataSource \| DataSourceOptions`        |          | DataSource name. Defaults to `"default"`. Determines the injection token.     |

### `@InjectRepo`

Injects a repository by class. Use the optional second argument to target a non-default connection.

```ts
constructor(
  @InjectRepo(BookRepo) readonly bookRepo: BookRepo,                         // default connection
  @InjectRepo(LogRepo, "secondary") readonly logRepo: LogRepo,               // named connection
  @InjectRepo(AuditRepo, auditDataSourceOptions) readonly auditRepo: AuditRepo,
) {}
```

> For the **default** connection, you can also use plain constructor injection (`readonly repo: BookRepo`) because the token resolves to the class itself. For non-default connections you **must** use `@InjectRepo(Repo, connectionName)` because the token is prefixed with the connection name.

### `RepositoryWrapper`

`TypeOrmRepository.findOne({ where: { id: undefined } })` silently strips `undefined` and returns the **first row of the table** — a well-known footgun that can cause accidental data leaks or auth bypasses.

`RepositoryWrapper` overrides `findOne` to return `null` when:

- `options` is missing / not an object
- `options.where` is falsy / not an object
- any mapped column appearing in `where` has the value `undefined`

```ts
import { RepositoryWrapper } from "nestjs-typeorm3-kit";

export class BaseRepo<Entity> extends RepositoryWrapper<Entity> {}

@DefEntityRepository(Book)
export class BookRepo extends BaseRepo<Book> {}
```

```ts
await bookRepo.findOne({ where: { id: undefined } }); // → null (safe)
await bookRepo.findOne({ where: { id: 1 } }); // → Book | null (normal)
```

---

## Transactions

### `setupTransactionContext`

Must be called in `main.ts` **before** `NestFactory.create`. It initialises `typeorm-transactional`'s `AsyncLocalStorage`-based context, which `@DefTransaction` (and the raw `@Transactional`) rely on.

```ts
import { setupTransactionContext, addTransactionalDataSource } from "nestjs-typeorm3-kit";

setupTransactionContext();
```

You also need to register each DataSource as transactional. This is typically done in your database module:

```ts
TypeOrmModule.forRootAsync({
  name: "default",
  useFactory: () => ({ /* ... */ }),
  dataSourceFactory: async (options) =>
    addTransactionalDataSource({ dataSource: new DataSource(options!) }),
});
```

### `@DefTransaction`

Decorator-based transactions — a thin wrapper over `typeorm-transactional`'s `@Transactional`.

```ts
import { DefTransaction } from "nestjs-typeorm3-kit";
import { Propagation } from "typeorm-transactional";

class BookService {
  @DefTransaction() // default connection, default propagation
  async create(dto: CreateBookDto) { /* ... */ }

  @DefTransaction({ connectionName: "secondary" }) // different DataSource
  async audit(dto: AuditDto) { /* ... */ }

  @DefTransaction({
    connectionName: "default",
    propagation: Propagation.REQUIRED,
    isoLevel: "READ_COMMITTED",
  })
  async complex() { /* ... */ }
}
```

**Options**

| Field            | Type                                                                                     | Description                         |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| `connectionName` | `string \| (() => string \| undefined)`                                                  | DataSource name.                    |
| `propagation`    | `Propagation` (from `typeorm-transactional`)                                             | Propagation strategy.               |
| `isoLevel`       | `"READ_UNCOMMITTED" \| "READ_COMMITTED" \| "REPEATABLE_READ" \| "SERIALIZABLE"`          | Isolation level.                    |

---

## Controller & module helpers

### `@DefController` and method decorators

`@DefController` is like `@Controller` but also applies `@ApiBearerAuth()`. The method decorators bundle `@Get/@Post/...`, `@HttpCode`, `@ApiOperation`, `@ApiResponse` and optionally `@ApiBody` into a single call.

```ts
import {
  DefController,
  DefGet,
  DefPost,
  DefPatch,
  DefDelete,
} from "nestjs-typeorm3-kit";
import { Body, Param, Query } from "@nestjs/common";

@DefController("books")
export class BookController {
  @DefGet("", { summary: "List books", responseType: [BookDto] })
  list(@Query() q: ListQuery) { /* ... */ }

  @DefPost("", { summary: "Create a book", bodyType: CreateBookDto, responseType: BookDto })
  create(@Body() dto: CreateBookDto) { /* ... */ }

  @DefPatch(":id", { bodyType: UpdateBookDto })
  update(@Param("id") id: string, @Body() dto: UpdateBookDto) { /* ... */ }

  @DefDelete(":id", { statusCode: 204 })
  remove(@Param("id") id: string) { /* ... */ }
}
```

**Method options**

| Field          | Type                                                 | Default            |
| -------------- | ---------------------------------------------------- | ------------------ |
| `summary`      | `string`                                             | `""`               |
| `statusCode`   | `HttpStatus`                                         | `HttpStatus.OK`    |
| `responseType` | `Type \| Function \| [Function] \| string`           | `undefined`        |
| `bodyType`\*   | `Type \| Function \| [Function] \| string`           | `undefined`        |

\* `bodyType` is only available on `DefPost`, `DefPut`, `DefPatch`, `DefDelete`.

### `@ChildModule`

Mounts a module under a route prefix and auto-tags its controllers in Swagger as `[PascalPrefix] ControllerName`. Prefixes propagate to any imported modules.

```ts
import { ChildModule } from "nestjs-typeorm3-kit";

@ChildModule({
  prefix: "client",
  imports: [BookRepoModule],
  controllers: [BookController],
  providers: [BookService],
})
export class ClientModule {}
```

Resulting routes get the `/client` prefix, and Swagger groups them under `[Client] BookController`.

---

## Swagger helper

### `configSwaggerDocument(app, document, path?)`

Merges `class-validator` metadata (via `class-validator-jsonschema`) into an existing OpenAPI document, then calls `SwaggerModule.setup`. Useful when you want validation decorators like `@MinLength`, `@IsEmail`, `@IsInt()` to appear as JSON Schema constraints in your API docs.

```ts
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { configSwaggerDocument } from "nestjs-typeorm3-kit";

const options = new DocumentBuilder()
  .setTitle("My API")
  .setVersion("1.0")
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, options);
configSwaggerDocument(app, document, "swagger"); // → GET /swagger
```

> 🐛 **Historical note:** Versions before 0.1.9 shipped with a bug where schemas were merged under the literal key `"key"` due to a missing computed property name. If you have an older copy of this logic inline in your `main.ts`, delete it and import `configSwaggerDocument` instead.

---

## Validation decorators

Re-export / convenience helpers built on top of `class-validator` + `class-transformer`:

### `@IsNumber({ required? })`

Coerces the value to a number and validates. By default the field is optional — pass `{ required: true }` to make it required.

```ts
class Query {
  @IsNumber() page?: number;
  @IsNumber({ required: true }) limit!: number;
}
```

### `@IsPhoneNumber(region, options?)`

Casts to `string` and delegates to `class-validator`'s `IsPhoneNumber` with a country code.

```ts
class Dto {
  @IsPhoneNumber("VN") phone!: string;
}
```

### `@IsLongerThan(otherProperty, options?)`

Custom validator that passes when the decorated string is strictly longer than another property on the same object.

```ts
class ResetPasswordDto {
  oldPassword!: string;
  @IsLongerThan("oldPassword") newPassword!: string;
}
```

---

## Utilities

### `lazyLoadClasses(baseDir, suffixes, additional?)`

Synchronously scans `baseDir`'s immediate subdirectories for files matching the given suffixes (e.g. `.controller`, `.service`) and returns the first exported class from each. Handy for generating `controllers`/`providers` arrays without maintaining a barrel file.

```ts
import { lazyLoadClasses } from "nestjs-typeorm3-kit";

@Module({
  controllers: lazyLoadClasses(__dirname, [".controller"]),
  providers: lazyLoadClasses(__dirname, [".service"]),
})
export class ClientModule {}
```

> Assumes **one exported class per file**. The first enumerated export is returned.

### `addTransactionalDataSource` (re-export)

Re-exported from `typeorm-transactional` for convenience so you only need to import from one package.

---

## Full example

A runnable Nest project is in [`./example`](./example) — two Postgres connections, `ChildModule`, `@DefTransaction` across connections, and Swagger wired up end-to-end. Start with:

```bash
cd example
yarn install
yarn start:dev
# http://localhost:3000/swagger
```

![Swagger UI](image.png)

---

## Testing

The package ships with two test configurations:

- **Unit tests** (`yarn test`) — fast, no external dependencies. Cover the `findOne` guard, Swagger helper, repository token resolution, `@DefTransaction`, controller / method decorators, `@ChildModule`, and validation decorators.
- **Integration tests** (`yarn test:integration`) — spin up the Nest module against a real Postgres (see `tests/src/app.module.ts`). Requires a Postgres instance matching the configured host/port.

```bash
yarn test               # unit tests
yarn test:integration   # integration tests (needs Postgres)
```

---

## Compatibility

| Peer dependency   | Range          |
| ----------------- | -------------- |
| `@nestjs/common`  | `>= 8.0.0`     |
| `@nestjs/core`    | `>= 8.0.0`     |
| `@nestjs/typeorm` | `>= 8.1.0`     |
| `typeorm`         | `>= 0.3.0`     |
| `typeorm-transactional` | `>= 0.5.0` |
| `reflect-metadata` | `>= 0.1.13`   |
| `rxjs`            | `>= 7.2.0`     |

Developed against NestJS v11 / TypeORM 0.3.x. For NestJS v8–v10 the public API surface is the same, but please test before upgrading in production.

---

## Troubleshooting

**`UnknownDependencyException: Nest can't resolve dependencies of ...`**
You forgot to import the `DefRepositoryModule`-wrapping module, or the repository's `@DefEntityRepository` decorator is missing. Also make sure the `globPattern` actually matches your file names (the module only picks up classes decorated with `@DefEntityRepository`).

**`Transactional context not initialised`**
`setupTransactionContext()` must run **before** `NestFactory.create(AppModule)`. And every DataSource that uses `@DefTransaction` must be wrapped in `addTransactionalDataSource(...)`.

**`findOne` returns `null` for a query I expect to work**
That's the `RepositoryWrapper` guard at work — one of the values passed in `where` is `undefined`. Either provide a real value or a `IsNull()`/`Not()` clause. If you need the raw TypeORM behaviour, use `Repository` instead of `RepositoryWrapper`.

**Swagger schemas merged into a key literally called `"key"`**
Upgrade to `nestjs-typeorm3-kit >= 0.1.9` and either (a) call `configSwaggerDocument(app, document)` or (b) if you had the old code copy-pasted into `main.ts`, replace it with the import.

**Repositories not picked up by the glob pattern**
Paths in the glob **must be absolute** (use `join(__dirname, '...')`). On Windows the module rewrites `\` → `/` automatically.

---

## License

MIT © [thanhluan.bkhn](mailto:thanhluan.bkhn@gmail.com)
