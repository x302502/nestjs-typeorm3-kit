# Repository pattern & nhiều DataSource

[← Quay lại index](../README.md) · [English](../en/repository.md)

Trang này gom mọi thứ liên quan đến định nghĩa repository, gắn vào Nest module, inject vào service, và `findOne` an toàn hơn của `RepositoryWrapper`.

## Tổng quan

TypeORM 0.3 đã bỏ decorator `@EntityRepository()` từng giúp custom repository rất tiện. `nestjs-typeorm3-kit` đưa pattern này quay lại với:

- `@DefEntityRepository(Entity)` — đánh dấu class là custom repository cho một entity.
- `DefRepositoryModule` — module Nest tự quét repository và đăng ký provider.
- `@InjectRepo(Repo, dataSource?)` — inject theo class, có thể chỉ định DataSource không phải mặc định.
- `RepositoryWrapper` — subclass `Repository` chặn lỗi "trả row đầu khi where có undefined" của TypeORM.

## Ví dụ nhanh

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
  constructor(readonly bookRepo: BookRepo) {} // connection mặc định
}
```

## Tham chiếu API

### `@DefEntityRepository(entity)`

Đánh dấu class là repository cho entity. Class **bắt buộc** phải extend `Repository<Entity>` (từ `typeorm`) hoặc `RepositoryWrapper<Entity>` (từ kit).

**Chữ ký**

```ts
function DefEntityRepository(target: EntityTarget<ObjectLiteral>): ClassDecorator;
```

**Tham số**

| Tên      | Kiểu                            | Bắt buộc | Mô tả                                                          |
| -------- | ------------------------------- | :------: | -------------------------------------------------------------- |
| `target` | `EntityTarget<ObjectLiteral>`   |    ✔     | Class entity (hoặc tham chiếu bảng) mà repository thao tác.   |

**Cách hoạt động.** Decorator lưu `target` vào class constructor qua `Reflect.defineMetadata(ENTITY_METADATA_KEY, target, Constructor)`. Sau đó `DefRepositoryModule` đọc metadata này để biết bind entity nào khi dựng provider.

**Lỗi hay gặp**

- Quên decorator → khi quét glob (`forRoot`/`forRootAsync`), class bị lờ đi (vì không có metadata key) và lúc chạy sẽ báo `UnknownDependencyException`. Còn `forFeature` sẽ throw `Repository: <Name> undetermined entity`.
- Decorate class không extend `Repository` → module vẫn gọi `new YourClass(entity, manager, queryRunner)`, nên bạn nhận về chính class đó mà không có method nào của TypeORM, và nó được đăng ký dưới token chuỗi `"<ClassName>Repository"` thay vì chính class.

---

### `RepositoryWrapper<Entity>`

Subclass của `TypeOrmRepository<Entity>` override các hàm lấy một dòng (`findOne`, `findOneBy`, `findOneOrFail`, `findOneByOrFail`) để trả `null` / throw `EntityNotFoundError` thay vì trả **row đầu của bảng** khi `where` có giá trị `undefined`.

**Vì sao cần.** `TypeORM.findOne({ where: { id: undefined } })` sẽ loại `id` khỏi điều kiện — mặc định `null` cũng bị loại y hệt — kết quả là `WHERE` trống và query trả row đầu bất kỳ — footgun nguy hiểm có thể gây auth bypass (ví dụ `findOne({ where: { id: req.user?.id } })` trả row admin).

**Behaviour**

`findOne(options?)` trả `null` khi một trong các điều sau đúng:

1. `options` thiếu hoặc không phải object.
2. `options.where` thiếu, `null`, hoặc không phải object.
3. `options.where` rỗng (`{}`, `[]`, hoặc mảng OR chứa `{}`).
4. Column, relation hoặc điều kiện embedded đã map có giá trị `undefined` hoặc `null`, hoặc điều kiện relation/embedded lồng nhau rỗng. Dùng `IsNull()` để lọc SQL `NULL`.

Ngược lại thì delegate xuống `Repository.findOne` gốc. Quy tắc tương tự áp dụng cho tham số `where` của `findOneBy(where)`; `findOneOrFail` / `findOneByOrFail` throw `EntityNotFoundError` ở những chỗ hai hàm kia trả `null`.

**Ví dụ**

```ts
export class BaseRepo<Entity> extends RepositoryWrapper<Entity> {}

@DefEntityRepository(Book)
export class BookRepo extends BaseRepo<Book> {}

await bookRepo.findOne({ where: { id: undefined } }); // → null (an toàn)
await bookRepo.findOne({ where: { id: 1 } });          // → Book | null (bình thường)
await bookRepo.findOne();                              // → null
await bookRepo.findOne({ where: {} });                 // → null (không có điều kiện)
await bookRepo.findOne({ where: [{}, { id: 1 }] });     // → null (nhánh OR không an toàn)
await bookRepo.findOne({ where: { author: { id: undefined } } }); // → null
await bookRepo.findOneBy({ id: undefined });                       // → null
await bookRepo.findOneOrFail({ where: { id: undefined } });       // → throw EntityNotFoundError
await bookRepo.findOneBy({ authorId: null });                      // → null (dùng IsNull())
```

**Option `invalidWhereValuesBehavior` của DataSource** (TypeORM ≥ 0.3.27) được tôn trọng: với `null: "sql-null"`, giá trị `null` được cho qua thành `IS NULL`; với `"throw"`, wrapper để TypeORM tự throw lỗi. Điều kiện rỗng (`{}`) vẫn bị chặn vì option đó không xử lý trường hợp này.

**Lỗi hay gặp**

- Điều kiện rỗng ở cấp đầu hoặc relation/embedded lồng nhau trả `null`; `undefined` trên thuộc tính đã map bị chặn ở mọi nhánh OR. Điều kiện hợp lệ vẫn dùng `findOne` của TypeORM.
- Các hàm lấy nhiều dòng (`find`, `findBy`, `count`, `exists`, …) và `update`/`delete` **không** được chặn: TypeORM bỏ giá trị `undefined`/`null` khỏi điều kiện, nên `findBy({ id: undefined })` khớp mọi dòng. Với TypeORM ≥ 0.3.27, hãy cho mọi hàm throw thay vì lặng lẽ bỏ điều kiện:

  ```ts
  new DataSource({
    // ...
    invalidWhereValuesBehavior: { undefined: "throw", null: "throw" },
  });
  ```
- Nếu cố ý muốn behaviour cũ của TypeORM, hãy extend `Repository` trực tiếp thay vì `RepositoryWrapper`.

---

### `DefRepositoryModule`

Dynamic module của Nest, quét các class có `@DefEntityRepository` và đăng ký làm provider, với token tự suy ra từ chính class (default connection) hoặc `<connectionName>_<ClassName>` (connection khác).

Ba kiểu đăng ký, chọn cái nào hợp với flow bootstrap.

#### `DefRepositoryModule.forFeature(repositories, dataSource?)`

Liệt kê repository tường minh. Hợp với module nhỏ hoặc khi không muốn quét glob.

**Chữ ký**

```ts
DefRepositoryModule.forFeature(
  repositories: Repository[],
  dataSource?: string | DataSource | DataSourceOptions,
): DynamicModule;
```

**Tham số**

| Tên            | Kiểu                                          | Bắt buộc | Mặc định    | Mô tả                                                              |
| -------------- | --------------------------------------------- | :------: | ----------- | ------------------------------------------------------------------ |
| `repositories` | `Repository[]`                                |    ✔     | —           | Danh sách class repository (đã có `@DefEntityRepository`).         |
| `dataSource`   | `string \| DataSource \| DataSourceOptions`   |          | `"default"` | Tên DataSource (string) hoặc object DataSource/options.            |

**Ví dụ**

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

Đăng ký theo glob; trả `Promise<DynamicModule>` vì cần resolve glob trước khi dựng module. Cả `forRoot` lẫn `forRootAsync` đều không dùng được DI của Nest; chọn `forRootAsync` khi option đến từ factory hoặc class option, hoặc module cần thêm `imports`.

**Chữ ký**

```ts
DefRepositoryModule.forRoot(options: DefRepositoryModuleOptions): Promise<DynamicModule>;
```

#### `DefRepositoryModule.forRootAsync(options)`

Đăng ký glob theo cấu hình custom. Phải resolve options trước khi Nest bootstrap vì quá trình quét quyết định các token repository được đăng ký vào DI container.

**Chữ ký**

```ts
DefRepositoryModule.forRootAsync(options: DefRepositoryModuleAsyncOptions): Promise<DynamicModule>;
```

**`DefRepositoryModuleAsyncOptions`**

| Field        | Kiểu                                                    | Bắt buộc | Mô tả                                                          |
| ------------ | ------------------------------------------------------- | :------: | -------------------------------------------------------------- |
| `imports`    | `ModuleMetadata["imports"]`                             |          | Module import bởi dynamic module kết quả.                      |
| `useFactory` | `() => DefRepositoryModuleOptions \| Promise<...>`       | ✔ *      | Factory không nhận DI, gọi một lần trước khi Nest bootstrap.   |
| `useClass`   | `Type<DefRepositoryOptionsFactory>`                     | ✔ *      | Class không cần DI, khởi tạo một lần trước khi Nest bootstrap.  |

* Chọn `useFactory` hoặc `useClass`. Không hỗ trợ `inject` hay `useExisting`:
Nest provider chưa tồn tại khi phải quét glob và xác định token.

**`DefRepositoryModuleOptions`**

| Field         | Kiểu                                          | Bắt buộc | Mặc định    | Mô tả                                                                |
| ------------- | --------------------------------------------- | :------: | ----------- | -------------------------------------------------------------------- |
| `globPattern` | `string`                                      |    ✔     | —           | Glob **tuyệt đối** để tìm `*.repo.ts` / `*.repo.js`.                 |
| `dataSource`  | `string \| DataSource \| DataSourceOptions`   |          | `"default"` | Tên DataSource. Quyết định token inject của mỗi repository.          |

**Ví dụ không dùng ConfigService**

```ts
DefRepositoryModule.forRootAsync({
  useFactory: async () => ({
    globPattern: join(__dirname, "./**/*.repo.{ts,js}"),
    dataSource: "default",
  }),
});
```

**Ghi chú về glob**

- Glob tự đổi `\` → `/` để hợp Windows.
- Chỉ file có **class export** mang `ENTITY_METADATA_KEY` (do `@DefEntityRepository` set) mới được đăng ký; export khác bị bỏ qua.
- Dùng glob tuyệt đối (`join(__dirname, …)`). Glob tương đối sẽ resolve theo `process.cwd()`, hiếm khi đúng trong app Nest.

---

### `@InjectRepo(repository, dataSource?)`

Helper DI resolve đúng token provider của một class repository trên một connection. Với connection **mặc định**, token chính là class, nên cũng có thể dùng constructor injection thường.

**Chữ ký**

```ts
function InjectRepo(
  repository: Repository,
  dataSource?: string | DataSource | DataSourceOptions,
): PropertyDecorator & ParameterDecorator;
```

**Tham số**

| Tên          | Kiểu                                          | Bắt buộc | Mặc định    | Mô tả                                            |
| ------------ | --------------------------------------------- | :------: | ----------- | ------------------------------------------------ |
| `repository` | `Repository`                                  |    ✔     | —           | Class repository.                                |
| `dataSource` | `string \| DataSource \| DataSourceOptions`   |          | `"default"` | Tên DataSource để giới hạn injection.            |

**Quy tắc token** (đây là cái `@InjectRepo` resolve bên dưới)

| Connection                              | Repository extend `Repository`? | Token                                       |
| --------------------------------------- | ------------------------------- | ------------------------------------------- |
| `"default"`                             | Có                              | Chính class repository.                     |
| `"default"`                             | Không                           | `"<ClassName>Repository"`                   |
| Có tên (ví dụ `"secondary"`)            | Có                              | `"<connectionName>_<ClassName>"`            |
| Có tên                                  | Không                           | `"<connectionName>_<ClassName>Repository"`  |

**Ví dụ — service đa connection**

```ts
@Injectable()
export class DemoService {
  constructor(
    readonly bookRepo: BookRepo,                                     // connection mặc định
    @InjectRepo(BookRepo, "secondary") readonly bookRepo2: BookRepo, // cùng class, DB secondary
    @InjectRepo(LogRepo, "secondary") readonly logRepo: LogRepo,
  ) {}
}
```

**Lỗi hay gặp**

- Connection mặc định có thể dùng constructor injection thường. Connection có tên **bắt buộc** dùng `@InjectRepo` vì token đã namespace.
- Truyền `DataSourceOptions` không có `name` thì coi như default connection.

## Pattern thường dùng

### Base repo có helper dùng chung

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

Sau đó mọi repo cụ thể extend `BaseRepo<E>` thay vì `Repository<E>` trực tiếp.

### Đổi connection lúc runtime

`DefRepositoryModule` resolve tên DataSource tại lúc init module, nên connection per provider là cố định. Nếu cần chọn connection theo request, hãy inject cả 2 provider và chọn trong code, hoặc tạo request-scoped factory trả về repository phù hợp.
