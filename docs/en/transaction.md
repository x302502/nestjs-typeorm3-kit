# Transactions

[← Back to docs index](../README.md) · [Tiếng Việt](../vi/transaction.md)

This page covers `setupTransactionContext`, `@DefTransaction`, the propagation and isolation enums, transaction hooks, and the gotchas you'll hit setting up multi-DataSource transactions on Node and Bun.

## Overview

`nestjs-typeorm3-kit` ships a vendored fork of `typeorm-transactional@0.5.0`. The fork removes the `cls-hooked` driver entirely, leaving only `AsyncLocalStorage` — which means transactions work on **Node.js >= 16.4** *and* **Bun** without extra configuration.

The transaction system has three layers:

1. **Bootstrap** — `setupTransactionContext()` initialises the AsyncLocalStorage-based context. Call this **once**, before `NestFactory.create`.
2. **DataSource registration** — every TypeORM `DataSource` you want to participate in transactions must be passed through `addTransactionalDataSource(...)`. This patches the DataSource's `manager`/`query`/`createQueryBuilder` so they pick up the per-request transaction.
3. **Method decoration** — slap `@DefTransaction()` on a service method to run it inside a transaction.

## Quick example

```ts
// main.ts
import { NestFactory } from "@nestjs/core";
import { setupTransactionContext } from "nestjs-typeorm3-kit";

async function bootstrap() {
  setupTransactionContext();           // (1) initialise
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

```ts
// database.module.ts
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource, DataSourceOptions } from "typeorm";
import { addTransactionalDataSource } from "nestjs-typeorm3-kit";

export const primaryDb = TypeOrmModule.forRootAsync({
  name: "default",
  useFactory: () => ({ /* type, host, port, … */ }),
  dataSourceFactory: async (options) =>
    addTransactionalDataSource({                                // (2) register
      name: "default",
      dataSource: new DataSource(options as DataSourceOptions),
    }),
});
```

```ts
// book.service.ts
import { DefTransaction } from "nestjs-typeorm3-kit";

class BookService {
  @DefTransaction()                                              // (3) decorate
  async create(dto: CreateBookDto) {
    const book = await this.bookRepo.save(dto);
    await this.logRepo.save({ action: "book.created", refId: book.id });
    return book;
  }
}
```

If `logRepo.save` throws, the earlier `bookRepo.save` is rolled back as long as both repositories operate on the same registered DataSource.

## API reference

### `setupTransactionContext(options?)`

Initialises the vendored transactional context.

**Signature**

```ts
function setupTransactionContext(options?: SetupTransactionContextOptions): void;
```

**`SetupTransactionContextOptions`**

| Field             | Type     | Default | Description                                                                                                                                                                          |
| ----------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxHookHandlers` | `number` | `10`    | Number of handlers of one type (`commit` / `rollback` / `complete`) per transaction before Node prints a possible-memory-leak warning. Not a hard limit: extra handlers still run. Set higher if you legitimately attach many hooks; `0`/`Infinity` disable the warning. |

**Rules**

- **Call once.** Calling twice silently keeps the first driver instance.
- **Before `NestFactory.create`.** The patches it applies to `EntityManager.prototype` and `Repository.prototype` must be in place before Nest constructs any module providers.
- No `storageDriver` option. The fork only ships `AsyncLocalStorage` — see the [Runtime support](#runtime-support) table.

**Example with custom hook ceiling**

```ts
setupTransactionContext({ maxHookHandlers: 50 });
```

#### Runtime support

| Runtime          |  Supported  | Why                                                                                          |
| ---------------- | :---------: | -------------------------------------------------------------------------------------------- |
| Node.js >= 16.4  |     ✅      | `AsyncLocalStorage` is native and battle-tested.                                             |
| Bun              |     ✅      | The fork removed `cls-hooked`, which Bun can't run; only `AsyncLocalStorage` is used now.    |
| Node.js < 16.4   |     ❌      | Upgrade Node, or stay on `nestjs-typeorm3-kit@0.1.x`.                                        |

---

### `addTransactionalDataSource(input)`

Registers a `DataSource` with the transactional context and patches its `manager`, `query`, and `createQueryBuilder` methods so they read the per-request `EntityManager` from `AsyncLocalStorage`.

**Signature**

```ts
function addTransactionalDataSource(
  input: DataSource | AddTransactionalDataSourceInput,
): DataSource;
```

**`AddTransactionalDataSourceInput`**

| Field        | Type         | Required | Default     | Description                                                                                                                          |
| ------------ | ------------ | :------: | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`       | `string`     |          | `"default"` | Name to look this DataSource up by. Must match the `connectionName` you pass to `@DefTransaction` / `@InjectRepo`.                   |
| `dataSource` | `DataSource` |    ✔     | —           | The TypeORM `DataSource` instance.                                                                                                   |
| `patch`      | `boolean`    |          | `true`      | Whether to patch the DataSource. Set to `false` only if you work exclusively with repositories and never touch `DataSource` methods. |

**Pitfalls**

- Registering the same `name` twice throws. Each connection name is unique.
- Forgetting to call this for a DataSource → `@DefTransaction` will throw `No data sources defined ... please call addTransactionalDataSources()`.
- Must be called *after* `setupTransactionContext()`. Typical placement is inside `TypeOrmModule.forRootAsync({ dataSourceFactory })`.

---

### `@DefTransaction(options?)`

Wraps a method so it runs inside a transaction.

**Signature**

```ts
function DefTransaction(options?: {
  connectionName?: string | (() => string | undefined);
  propagation?: Propagation;
  isolationLevel?: IsolationLevel | "READ_UNCOMMITTED" | "READ_COMMITTED" | "REPEATABLE_READ" | "SERIALIZABLE";
  isoLevel?: "READ_UNCOMMITTED" | "READ_COMMITTED" | "REPEATABLE_READ" | "SERIALIZABLE";
}): MethodDecorator;
```

**Options**

| Field            | Type                                                                            | Required | Default                | Description                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------- | :------: | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connectionName` | `string \| (() => string \| undefined)`                                         |          | `"default"`            | DataSource name. Use a function if you need to choose at call time (e.g. tenant per request, resolved from `AsyncLocalStorage`).                              |
| `propagation`    | `Propagation`                                                                   |          | `Propagation.REQUIRED` | What to do if the method is called while another transaction is already active. See the [propagation table](#propagation-modes).                              |
| `isolationLevel` | `IsolationLevel` or its enum key                                                |          | DB default             | Isolation level for a new transaction; converted to the SQL isolation value.                                                                                 |
| `isoLevel`       | `"READ_UNCOMMITTED" \| "READ_COMMITTED" \| "REPEATABLE_READ" \| "SERIALIZABLE"` |          | DB default             | Legacy alias for `isolationLevel`.                                                                                                                            |

**Examples**

```ts
class BookService {
  @DefTransaction()                                       // default connection, REQUIRED
  async create(dto: CreateBookDto) { /* ... */ }

  @DefTransaction({ connectionName: "secondary" })
  async audit(dto: AuditDto) { /* ... */ }

  @DefTransaction({ propagation: Propagation.REQUIRES_NEW, isoLevel: "SERIALIZABLE" })
  async exclusive() { /* ... */ }
}
```

**Pitfalls**

- The function form of `connectionName` is evaluated **each call**, but the returned name must still match a DataSource registered with `addTransactionalDataSource`.
- `@DefTransaction` only wraps the method itself. If the wrapped method spawns detached promises (`void doThing()`) those will not be in the transaction context.

---

### Propagation modes

```ts
import { Propagation } from "nestjs-typeorm3-kit";
```

| Value             | When already in a transaction                  | When not in one                                |
| ----------------- | ---------------------------------------------- | ---------------------------------------------- |
| `REQUIRED` (default) | Joins the existing one.                     | Starts a new one.                              |
| `REQUIRES_NEW`    | Suspends the outer, runs in a brand new one.   | Starts a new one.                              |
| `NESTED`          | Runs in a savepoint inside the outer.          | Starts a new one.                              |
| `MANDATORY`       | Joins the existing one.                        | **Throws** `TransactionalError`.               |
| `NEVER`           | **Throws** `TransactionalError`.               | Runs without a transaction.                    |
| `SUPPORTS`        | Joins the existing one.                        | Runs without a transaction.                    |
| `NOT_SUPPORTED`   | Suspends the outer, runs without a transaction. | Runs without a transaction.                   |

`NESTED` uses TypeORM's savepoint on the active manager. Releasing a savepoint
does not commit its writes independently: rolling back the outer transaction
also rolls them back.

Sibling `NESTED` operations on the same transaction run their savepoints in
order; a child rollback cannot target another child's savepoint. Different
DataSources are not serialized against one another.

A child must not wait for another sibling's `NESTED` body to start: the sibling
cannot enter its savepoint until the first child finishes.

---

### Isolation levels

```ts
import { IsolationLevel } from "nestjs-typeorm3-kit";
```

| Value              | SQL                  | Notes                                                                                  |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------- |
| `READ_UNCOMMITTED` | `READ UNCOMMITTED`   | Dirty reads possible. Rarely useful.                                                   |
| `READ_COMMITTED`   | `READ COMMITTED`     | Default for Postgres / MSSQL. No dirty reads.                                          |
| `REPEATABLE_READ`  | `REPEATABLE READ`    | Default for MySQL. No non-repeatable reads. Phantom reads possible (except Postgres). |
| `SERIALIZABLE`     | `SERIALIZABLE`       | Strongest, slowest. May abort with serialization failure; you handle the retry.        |

> Prefer `@DefTransaction({ isolationLevel: IsolationLevel.READ_COMMITTED })`; `isoLevel: "READ_COMMITTED"` remains supported.

---

### Transaction hooks

Three helpers register callbacks that fire on the current transaction's outcome. They must be called from **inside** a `@DefTransaction` method.

```ts
import {
  runOnTransactionCommit,
  runOnTransactionRollback,
  runOnTransactionComplete,
} from "nestjs-typeorm3-kit";

@DefTransaction()
async create(dto: CreateBookDto) {
  const book = await this.repo.save(dto);

  runOnTransactionCommit(() => this.events.emit("book.created", book));
  runOnTransactionRollback((err) => this.logger.warn("rolled back", err));
  runOnTransactionComplete((err) => /* always fires */ {});

  return book;
}
```

| Function                    | Signature                          | Fires when                                                                  |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `runOnTransactionCommit`    | `(cb: () => void) => void`         | After the surrounding transaction commits successfully.                     |
| `runOnTransactionRollback`  | `(cb: (e: Error) => void) => void` | After the surrounding transaction rolls back.                               |
| `runOnTransactionComplete`  | `(cb: (e?: Error) => void) => void` | After either commit or rollback. `e` is set on rollback, undefined on commit. |

For `NESTED`, a successful savepoint defers commit/complete hooks until the
outer transaction finishes. An outer rollback instead fires its rollback/
complete hooks. A savepoint that itself rolls back fires rollback/complete
hooks even if its caller catches the error and later commits the outer transaction.

When transactions on different DataSources are nested, a savepoint's hooks
follow its owning DataSource transaction, not the innermost unrelated one.

**Pitfalls**

- Calling these *outside* a transaction throws `No hook manager found in context. Are you using @Transactional()?`.
- Hooks are fired via `setImmediate`. Don't rely on them having run synchronously after the decorated method returns.
- Attaching more than `maxHookHandlers` hooks of one type per transaction only triggers a Node warning; the hooks still run.

---

### Lower-level helpers (re-exports)

These all come from the vendored module and are re-exported from `nestjs-typeorm3-kit` for convenience.

| Symbol                      | Purpose                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Transactional(options?)`   | The raw decorator that `@DefTransaction` wraps. Use this if you want to bypass the kit's option remapping.                    |
| `runInTransaction(fn, opts?)` | Function-style transaction without decorating. Useful in scripts / one-offs.                                                |
| `wrapInTransaction(fn, opts?)` | Returns a transactional version of `fn` without calling it.                                                                |
| `TransactionalError`        | Thrown by `MANDATORY` / `NEVER` propagation when their precondition is violated.                                              |
| `getDataSourceByName(name)` | Look up a previously registered DataSource. Returns `undefined` if not found.                                                 |
| `deleteDataSourceByName(name)` | Remove a registered DataSource. Mostly useful in tests.                                                                    |
| `StorageDriver`             | Enum kept for type compatibility; only `AUTO` (alias) and `ASYNC_LOCAL_STORAGE` exist.                                        |

## Patterns

### Multi-DataSource transactions

You can decorate a method with `@DefTransaction({ connectionName: "primary" })` and inject repositories from another DataSource — but writes to the other DataSource will **not** be in the same transaction. Two physical databases require two separate transactions (one per DataSource), which is a fundamental SQL limitation, not a kit one.

If you need atomicity across DBs you must implement an outbox or 2-phase commit yourself.

### Choosing the connection dynamically (per-tenant)

```ts
class TenantService {
  @DefTransaction({ connectionName: () => tenantContext.getConnectionName() })
  async run() { /* ... */ }
}
```

`tenantContext.getConnectionName()` must read from `AsyncLocalStorage` populated by your auth middleware.

### Testing services that use `@DefTransaction`

Skip the real DataSource entirely by mocking the decorator to a no-op:

```ts
jest.mock("nestjs-typeorm3-kit", () => {
  const actual = jest.requireActual("nestjs-typeorm3-kit");
  return {
    ...actual,
    DefTransaction:
      () =>
      (
        _t: object,
        _k: string | symbol,
        descriptor: PropertyDescriptor,
      ) => descriptor,
  };
});
```

This is exactly what `example/src/__tests__/mock-transactional.ts` does.
