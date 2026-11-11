# Transaction

[← Quay lại index](../README.md) · [English](../en/transaction.md)

Trang này gom `setupTransactionContext`, `@DefTransaction`, các enum propagation / isolation, transaction hooks, và những lỗi hay gặp khi setup transaction đa DataSource trên Node và Bun.

## Tổng quan

`nestjs-typeorm3-kit` vendor (fork) `typeorm-transactional@0.5.0`. Fork này bỏ hẳn driver `cls-hooked`, chỉ giữ `AsyncLocalStorage` — nhờ vậy transaction chạy được trên **Node.js >= 16.4** *và* **Bun** không cần config thêm.

Hệ thống transaction có 3 lớp:

1. **Bootstrap** — `setupTransactionContext()` khởi tạo context dựa trên AsyncLocalStorage. Gọi **một lần**, trước `NestFactory.create`.
2. **Đăng ký DataSource** — mọi `DataSource` của TypeORM muốn tham gia transaction phải đi qua `addTransactionalDataSource(...)`. Hàm này patch các method `manager`/`query`/`createQueryBuilder` của DataSource để chúng đọc transaction theo request.
3. **Decorator method** — gắn `@DefTransaction()` vào method service để chạy trong transaction.

## Ví dụ nhanh

```ts
// main.ts
import { NestFactory } from "@nestjs/core";
import { setupTransactionContext } from "nestjs-typeorm3-kit";

async function bootstrap() {
  setupTransactionContext();           // (1) khởi tạo
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
    addTransactionalDataSource({                                // (2) đăng ký
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

Nếu `logRepo.save` throw, `bookRepo.save` ở trên cũng rollback, với điều kiện cả hai repository làm việc trên **cùng một DataSource** đã đăng ký.

## Tham chiếu API

### `setupTransactionContext(options?)`

Khởi tạo context của transactional vendored.

**Chữ ký**

```ts
function setupTransactionContext(options?: SetupTransactionContextOptions): void;
```

**`SetupTransactionContextOptions`**

| Field             | Kiểu     | Mặc định | Mô tả                                                                                                                                                                            |
| ----------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxHookHandlers` | `number` | `10`     | Số handler cùng loại (`commit`/`rollback`/`complete`) trên một transaction trước khi Node in cảnh báo nghi rò rỉ bộ nhớ. Không phải giới hạn cứng: handler vượt mức vẫn chạy. Tăng nếu thực sự dùng nhiều hook; truyền `0`/`Infinity` để tắt cảnh báo.                       |

**Quy tắc**

- **Gọi một lần.** Gọi lần thứ hai vẫn giữ driver cũ.
- **Trước `NestFactory.create`.** Các patch lên `EntityManager.prototype` và `Repository.prototype` phải có trước khi Nest dựng provider.
- Không có option `storageDriver`. Fork chỉ ship `AsyncLocalStorage` — xem bảng [Hỗ trợ runtime](#hỗ-trợ-runtime).

**Ví dụ tăng max hook**

```ts
setupTransactionContext({ maxHookHandlers: 50 });
```

#### Hỗ trợ runtime

| Runtime          | Hỗ trợ | Tại sao                                                                                  |
| ---------------- | :----: | ---------------------------------------------------------------------------------------- |
| Node.js >= 16.4  |   ✅   | `AsyncLocalStorage` là native, ổn định.                                                  |
| Bun              |   ✅   | Fork đã bỏ `cls-hooked` (Bun không chạy được); giờ chỉ dùng `AsyncLocalStorage`.         |
| Node.js < 16.4   |   ❌   | Nâng Node, hoặc giữ `nestjs-typeorm3-kit@0.1.x`.                                         |

---

### `addTransactionalDataSource(input)`

Đăng ký `DataSource` vào context transactional và patch các method `manager`, `query`, `createQueryBuilder` để chúng đọc `EntityManager` per-request từ `AsyncLocalStorage`.

**Chữ ký**

```ts
function addTransactionalDataSource(
  input: DataSource | AddTransactionalDataSourceInput,
): DataSource;
```

**`AddTransactionalDataSourceInput`**

| Field        | Kiểu         | Bắt buộc | Mặc định    | Mô tả                                                                                                                                  |
| ------------ | ------------ | :------: | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | `string`     |          | `"default"` | Tên dùng để lookup DataSource. Phải khớp `connectionName` truyền vào `@DefTransaction` / `@InjectRepo`.                                |
| `dataSource` | `DataSource` |    ✔     | —           | Instance `DataSource` của TypeORM.                                                                                                     |
| `patch`      | `boolean`    |          | `true`      | Có patch DataSource hay không. Chỉ set `false` nếu chỉ dùng repository và không bao giờ gọi trực tiếp method của `DataSource`.         |

**Lỗi hay gặp**

- Đăng ký cùng `name` hai lần sẽ throw. Mỗi tên connection phải duy nhất.
- Quên gọi cho một DataSource → `@DefTransaction` throw `No data sources defined ... please call addTransactionalDataSources()`.
- Phải gọi *sau* `setupTransactionContext()`. Vị trí điển hình là trong `TypeOrmModule.forRootAsync({ dataSourceFactory })`.

---

### `@DefTransaction(options?)`

Bọc method để chạy trong một transaction.

**Chữ ký**

```ts
function DefTransaction(options?: {
  connectionName?: string | (() => string | undefined);
  propagation?: Propagation;
  isolationLevel?: IsolationLevel | "READ_UNCOMMITTED" | "READ_COMMITTED" | "REPEATABLE_READ" | "SERIALIZABLE";
  isoLevel?: "READ_UNCOMMITTED" | "READ_COMMITTED" | "REPEATABLE_READ" | "SERIALIZABLE";
}): MethodDecorator;
```

**Options**

| Field            | Kiểu                                                                            | Bắt buộc | Mặc định               | Mô tả                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------- | :------: | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connectionName` | `string \| (() => string \| undefined)`                                         |          | `"default"`            | Tên DataSource. Dùng dạng function nếu cần chọn lúc call (ví dụ multi-tenant — đọc từ `AsyncLocalStorage`).                                                            |
| `propagation`    | `Propagation`                                                                   |          | `Propagation.REQUIRED` | Cách xử lý khi method được gọi trong khi đã có transaction khác. Xem [bảng propagation](#chế-độ-propagation).                                                          |
| `isolationLevel` | `IsolationLevel` hoặc tên enum                                                 |          | DB mặc định            | Isolation level khi mở transaction mới; chuyển sang giá trị SQL trước khi gọi TypeORM.                                                                        |
| `isoLevel`       | `"READ_UNCOMMITTED" \| "READ_COMMITTED" \| "REPEATABLE_READ" \| "SERIALIZABLE"` |          | DB mặc định            | Tên cũ của `isolationLevel`, vẫn được hỗ trợ.                                                                                                                  |

**Ví dụ**

```ts
class BookService {
  @DefTransaction()                                       // connection mặc định, REQUIRED
  async create(dto: CreateBookDto) { /* ... */ }

  @DefTransaction({ connectionName: "secondary" })
  async audit(dto: AuditDto) { /* ... */ }

  @DefTransaction({ propagation: Propagation.REQUIRES_NEW, isoLevel: "SERIALIZABLE" })
  async exclusive() { /* ... */ }
}
```

**Lỗi hay gặp**

- Dạng function của `connectionName` evaluate **mỗi lần gọi**, nhưng tên trả về vẫn phải khớp DataSource đã `addTransactionalDataSource`.
- `@DefTransaction` chỉ bọc đúng method được decorate. Nếu method spawn promise rời (`void doThing()`), nó sẽ không nằm trong context transaction.

---

### Chế độ propagation

```ts
import { Propagation } from "nestjs-typeorm3-kit";
```

| Giá trị              | Nếu đã có transaction                          | Nếu chưa có                                |
| -------------------- | ---------------------------------------------- | ------------------------------------------ |
| `REQUIRED` (mặc định) | Tham gia transaction hiện tại.                 | Mở transaction mới.                        |
| `REQUIRES_NEW`        | Tạm ngắt outer, chạy trong transaction mới.    | Mở transaction mới.                        |
| `NESTED`              | Chạy trong savepoint của outer.                | Mở transaction mới.                        |
| `MANDATORY`           | Tham gia transaction hiện tại.                 | **Throw** `TransactionalError`.            |
| `NEVER`               | **Throw** `TransactionalError`.                | Chạy không transaction.                    |
| `SUPPORTS`            | Tham gia transaction hiện tại.                 | Chạy không transaction.                    |
| `NOT_SUPPORTED`       | Tạm ngắt outer, chạy không transaction.        | Chạy không transaction.                    |

`NESTED` dùng savepoint của TypeORM trên manager hiện tại. Release savepoint
không commit dữ liệu riêng: nếu outer transaction rollback thì dữ liệu đó cũng
rollback.

Các lệnh `NESTED` cùng parent transaction chạy savepoint lần lượt, để rollback
của một nhánh không đụng savepoint của nhánh khác. Các DataSource khác nhau
không bị khóa chung.

Một nhánh không được chờ nhánh `NESTED` cùng parent bắt đầu: nhánh được chờ
chỉ được mở savepoint sau khi nhánh đang chờ kết thúc, nên cả hai sẽ kẹt (deadlock).

---

### Isolation level

```ts
import { IsolationLevel } from "nestjs-typeorm3-kit";
```

| Giá trị            | SQL                  | Ghi chú                                                                              |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------ |
| `READ_UNCOMMITTED` | `READ UNCOMMITTED`   | Cho phép dirty read. Hiếm khi dùng.                                                  |
| `READ_COMMITTED`   | `READ COMMITTED`     | Mặc định của Postgres / MSSQL. Không dirty read.                                     |
| `REPEATABLE_READ`  | `REPEATABLE READ`    | Mặc định MySQL. Không non-repeatable read. Có thể có phantom (trừ Postgres).         |
| `SERIALIZABLE`     | `SERIALIZABLE`       | Chặt nhất, chậm nhất. Có thể abort vì serialization failure; bạn tự xử lý retry.     |

> Nên dùng `@DefTransaction({ isolationLevel: IsolationLevel.READ_COMMITTED })`; `isoLevel: "READ_COMMITTED"` vẫn được hỗ trợ.

---

### Transaction hooks

Ba helper đăng ký callback theo kết quả transaction hiện tại. Phải gọi **bên trong** method có `@DefTransaction`.

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
  runOnTransactionComplete((err) => /* luôn fire */ {});

  return book;
}
```

| Hàm                          | Chữ ký                              | Fire khi                                                                  |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `runOnTransactionCommit`     | `(cb: () => void) => void`          | Transaction commit thành công.                                            |
| `runOnTransactionRollback`   | `(cb: (e: Error) => void) => void`  | Transaction rollback.                                                     |
| `runOnTransactionComplete`   | `(cb: (e?: Error) => void) => void` | Luôn fire (sau commit hoặc rollback). `e` có khi rollback, undefined khi commit. |

Với `NESTED`, savepoint thành công chỉ chạy hook commit/complete sau khi outer
transaction kết thúc. Nếu outer rollback thì chạy hook rollback/complete.
Savepoint tự rollback sẽ chạy hook rollback/complete dù caller bắt lỗi và
sau đó commit outer transaction.

Khi lồng transaction của nhiều DataSource, hook của savepoint theo transaction
trên đúng DataSource của nó, không theo transaction sâu nhất của DataSource khác.

**Lỗi hay gặp**

- Gọi *ngoài* transaction sẽ throw `No hook manager found in context. Are you using @Transactional()?`.
- Hook fire qua `setImmediate`, đừng kỳ vọng nó chạy đồng bộ ngay sau method decorate return.
- Attach quá `maxHookHandlers` hook cùng loại trên một transaction chỉ làm Node in cảnh báo; hook vẫn chạy.

---

### Helper cấp thấp (re-export)

Đều đến từ module vendored, được re-export qua `nestjs-typeorm3-kit` cho tiện.

| Symbol                          | Mục đích                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Transactional(options?)`       | Decorator gốc mà `@DefTransaction` bọc lại. Dùng khi muốn bypass remap option của kit.                                    |
| `runInTransaction(fn, opts?)`   | Chạy transaction kiểu function, không cần decorate. Hữu ích cho script / one-off.                                         |
| `wrapInTransaction(fn, opts?)`  | Trả về phiên bản transactional của `fn` mà không gọi luôn.                                                                |
| `TransactionalError`            | Throw bởi propagation `MANDATORY` / `NEVER` khi điều kiện không thoả.                                                     |
| `getDataSourceByName(name)`     | Lookup DataSource đã đăng ký. Trả `undefined` nếu không có.                                                                |
| `deleteDataSourceByName(name)`  | Xoá DataSource đã đăng ký. Hữu ích trong test.                                                                            |
| `StorageDriver`                 | Enum giữ lại cho compat type; chỉ còn `AUTO` (alias) và `ASYNC_LOCAL_STORAGE`.                                            |

## Pattern thường dùng

### Transaction qua nhiều DataSource

Bạn có thể `@DefTransaction({ connectionName: "primary" })` rồi inject repository từ DataSource khác — nhưng các write trên DataSource thứ hai sẽ **không** nằm trong cùng transaction. Hai DB vật lý cần hai transaction riêng biệt (một per DataSource), đây là giới hạn cơ bản của SQL, không phải của kit.

Cần atomicity giữa nhiều DB thì phải tự cài outbox hoặc 2-phase commit.

### Chọn connection theo tenant (lúc runtime)

```ts
class TenantService {
  @DefTransaction({ connectionName: () => tenantContext.getConnectionName() })
  async run() { /* ... */ }
}
```

`tenantContext.getConnectionName()` phải đọc từ `AsyncLocalStorage` được middleware auth populate.

### Test service dùng `@DefTransaction`

Bỏ qua DataSource thật bằng cách mock decorator thành no-op:

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

Đây chính là cách `example/src/__tests__/mock-transactional.ts` đang làm.
