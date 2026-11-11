# Controller, decorator method & `@ChildModule`

[← Quay lại index](../README.md) · [English](../en/controller.md)

Trang này bao gồm `@DefController`, các decorator HTTP method (`@DefGet`, `@DefPost`, `@DefPut`, `@DefPatch`, `@DefDelete`), và decorator `@ChildModule` để mount Nest module dưới một prefix route đồng thời tự tag group Swagger.

## Tổng quan

`@Controller`/`@Get`/`@Post`/... của Nest ép bạn nhớ thêm `@ApiBearerAuth`, `@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@HttpCode`. Các decorator của kit gom tất cả vào một call duy nhất cho mỗi method, controller giữ focus vào routing và metadata Swagger nằm ngay bên cạnh.

## Ví dụ nhanh

```ts
import { Body, Query, Param } from "@nestjs/common";
import {
  DefController,
  DefGet, DefPost, DefPatch, DefDelete,
} from "nestjs-typeorm3-kit";

@DefController("books")
export class BookController {
  constructor(private readonly svc: BookService) {}

  @DefGet("", { summary: "Liệt kê sách", responseType: [BookDto] })
  list(@Query() q: ListQuery) { return this.svc.list(q); }

  @DefPost("", { bodyType: CreateBookDto, responseType: BookDto })
  create(@Body() dto: CreateBookDto) { return this.svc.create(dto); }

  @DefPatch(":id", { bodyType: UpdateBookDto })
  update(@Param("id") id: string, @Body() dto: UpdateBookDto) {
    return this.svc.update(id, dto);
  }

  @DefDelete(":id", { statusCode: 204 })
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
```

## Tham chiếu API

### `@DefController(prefix?)`

Thay thế trực tiếp cho `@Controller(...)`, tự thêm `@ApiBearerAuth()`. Mọi tham số `@Controller` nhận được, decorator này cũng nhận được.

**Chữ ký**

```ts
function DefController(prefix?: string | string[]): ClassDecorator;
function DefController(options: ControllerOptions): ClassDecorator;
```

**Tham số**

| Tên                | Kiểu                                          | Bắt buộc | Mặc định | Mô tả                                                                  |
| ------------------ | --------------------------------------------- | :------: | -------- | ---------------------------------------------------------------------- |
| `prefix`/`options` | `string \| string[] \| ControllerOptions`     |          | `"/"`    | Prefix route (hoặc `ControllerOptions` đầy đủ với `path`, `version`, …). |

**Tương đương:**

```ts
@Controller(prefix)
@ApiBearerAuth()
class FooController {}
```

**Lỗi hay gặp.** `@DefController` luôn thêm Bearer auth vào Swagger. Nếu controller thực sự public, hãy dùng `@Controller` thường — không thì người đọc tưởng endpoint cần token.

---

### `@DefGet(path?, options?)`

Gộp `@Get`, `@HttpCode`, `@ApiOperation`, `@ApiResponse`.

**Chữ ký**

```ts
function DefGet(
  path?: string | string[],
  options?: MethodGetOptions,
): MethodDecorator;
```

**`MethodGetOptions`**

| Field          | Kiểu                                          | Mặc định        | Mô tả                                                                  |
| -------------- | --------------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `summary`      | `string`                                      | `""`            | Truyền vào `@ApiOperation({ summary })`.                               |
| `statusCode`   | `HttpStatus`                                  | `HttpStatus.OK` | Truyền vào `@HttpCode` và `@ApiResponse({ status })`.                  |
| `responseType` | `Type \| Function \| [Function] \| string`    | `undefined`     | Truyền vào `@ApiResponse({ type })`. Dùng `[BookDto]` cho array.       |

---

### `@DefPost(path?, options?)` · `@DefPut` · `@DefPatch` · `@DefDelete`

Cấu trúc giống `@DefGet`, thêm option `bodyType` để add `@ApiBody({ type: bodyType })`.

**Chữ ký**

```ts
function DefPost(
  path?: string | string[],
  options?: MethodOptions,
): MethodDecorator;
// Tương tự cho DefPut, DefPatch, DefDelete.
```

**`MethodOptions`** (extends `MethodGetOptions`)

| Field          | Kiểu                                          | Mặc định        | Mô tả                                                            |
| -------------- | --------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| `summary`      | `string`                                      | `""`            | `@ApiOperation({ summary })`.                                    |
| `statusCode`   | `HttpStatus`                                  | `HttpStatus.OK` | `@HttpCode` và `@ApiResponse({ status })`.                       |
| `responseType` | `Type \| Function \| [Function] \| string`    | `undefined`     | `@ApiResponse({ type })`.                                        |
| `bodyType`     | `Type \| Function \| [Function] \| string`    | `undefined`     | `@ApiBody({ type })`. Hữu ích khi DTO không infer được từ `@Body()`. |

**Lỗi hay gặp**

- `statusCode` mặc định là `200` ngay cả cho `@DefPost`/`@DefDelete` — set tay (`201`, `204`) khi action không phải OK chung chung.
- `bodyType: undefined` là no-op; `@ApiBody` chỉ emit khi bạn thực sự truyền type.

---

### `@ChildModule(metadata)`

Decorator giống `@Module` nhưng **còn**:

1. Set metadata `MODULE_PATH` trên class module với prefix đã chuẩn hoá (`/abc/v1`).
2. Truyền prefix xuống mọi module trong `imports` — nên một `@ChildModule({ prefix: "outer" })` import `@ChildModule({ prefix: "inner" })` sẽ mount inner ở `/outer/inner`.
3. Thêm `@ApiTags("[PascalPrefix] ControllerName")` cho mọi controller trong `controllers`.

**Chữ ký**

```ts
function ChildModule(metadata: IChildModuleMetadata): ClassDecorator;
```

**`IChildModuleMetadata`** (extends `ModuleMetadata`)

| Field         | Kiểu                            | Mặc định | Mô tả                                                                                           |
| ------------- | ------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `prefix`      | `string`                        | `""`     | Đoạn prefix route. Slash được normalise (`//foo//` → `foo`).                                    |
| `imports`     | `ModuleMetadata["imports"]`     | `[]`     | Giống `@Module`. Prefix sẽ propagate xuống các module này.                                      |
| `controllers` | `ModuleMetadata["controllers"]` | `[]`     | Giống `@Module`. Mỗi controller được auto-tag Swagger.                                          |
| `providers`   | `ModuleMetadata["providers"]`   | `[]`     | Giống `@Module`. Không bị ảnh hưởng bởi prefix.                                                 |
| `exports`     | `ModuleMetadata["exports"]`     | `[]`     | Giống `@Module`.                                                                                |

**Ví dụ**

```ts
@ChildModule({
  prefix: "client",
  imports: [PrimaryRepoModule, SecondaryRepoModule],
  controllers: [BookController, AuthorController],
  providers: [BookService, AuthorService],
})
export class ClientModule {}
```

Route thành `/client/books`, `/client/authors`. Swagger group: `[Client] BookController`, `[Client] AuthorController`.

**Lỗi hay gặp**

- Module có đăng ký controller (trực tiếp hoặc qua các import của nó) được gắn prefix riêng theo từng parent: dùng cùng một child như vậy ở hai parent sẽ tạo hai module instance, và provider khai báo trong module đó được tạo một lần cho mỗi chỗ mount. Module không có controller (service, repository module, module `@Global`) được dùng chung nên provider vẫn là singleton — hãy đặt state dùng chung (cache, connection) trong một module không có route.
- Muốn lọc Swagger theo `include: [ChildModuleClass]` trên nhiều prefix, dùng `createScopedSwaggerDocument` thay cho `SwaggerModule.createDocument`. Hàm gốc so sánh class identity nên bỏ sót bản mount đã scope; `include: [ParentModule]` với `deepScanRoutes: true` chỉ quét import trực tiếp.
- `@Controller` thường (không có `@DefController`) vẫn được tag, nhưng không có yêu cầu Bearer auth.

## Pattern thường dùng

### Mount API có version

```ts
@ChildModule({ prefix: "api/v1", imports: [V1ClientModule] })
export class V1RootModule {}
```

Kết hợp với URI versioning của Nest có thể giữ controller riêng cho mỗi version.

### Tắt Bearer auth cho một endpoint

`@DefController` luôn áp `@ApiBearerAuth()`, và decorator security ở cấp method được cộng thêm chứ không thay thế nó (`@ApiSecurity('none')` vẫn giữ `bearer` và còn tham chiếu tới scheme `none` không tồn tại). Hãy đặt route public trong một controller dùng `@Controller` thường. Tag Bearer trong Swagger thuần là documentation; không tự enforce auth — vẫn là job của guard.
