# Tích hợp Swagger

[← Quay lại index](../README.md) · [English](../en/swagger.md)

Trang này mô tả `createScopedSwaggerDocument` và `configSwaggerDocument`: chọn đủ các route của `ChildModule` được mount dưới nhiều prefix và đưa metadata `class-validator` vào OpenAPI.

## Tổng quan

`@nestjs/swagger` build OpenAPI schema bằng cách đọc decorator `@ApiProperty()`. Mặc định nó **không** đọc decorator của `class-validator` — nên `@MinLength(3)`, `@IsEmail()`, `@IsInt()` v.v. không xuất hiện trong doc trừ khi bạn viết lại bằng `@ApiProperty`.

`configSwaggerDocument` chạy `validationMetadatasToSchemas` từ `class-validator-jsonschema`, merge kết quả vào `components.schemas` của OpenAPI document, rồi gọi `SwaggerModule.setup` để mount UI.

> ⚠️ **Bug cũ.** Phiên bản trước `0.2.0` có typo (`{ key: value }` thay vì `{ [key]: value }`) khiến *mọi* schema bị merge dưới key literal `"key"`. Nếu bạn từng copy đoạn code đó vào `main.ts`, hãy thay bằng helper này.

## Ví dụ nhanh

```ts
// main.ts
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder } from "@nestjs/swagger";
import { createScopedSwaggerDocument, configSwaggerDocument, setupTransactionContext } from "nestjs-typeorm3-kit";

async function bootstrap() {
  setupTransactionContext();
  const app = await NestFactory.create(AppModule);

  const options = new DocumentBuilder()
    .setTitle("My API")
    .setDescription("Demo API")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();

  const document = createScopedSwaggerDocument(app, options);
  configSwaggerDocument(app, document, "swagger"); // GET /swagger

  await app.listen(3000);
}
bootstrap();
```

## Tham chiếu API

### `createScopedSwaggerDocument(app, config, options?)`

Khi lọc bằng `include: [ChildModuleClass]`, dùng helper này thay vì
`SwaggerModule.createDocument`. Nest phải dùng class module riêng cho mỗi
prefix; Swagger mặc định so sánh class theo identity nên bỏ sót các bản mount
đã thêm prefix. Helper mở rộng `include` tới tất cả bản mount và giữ nguyên
các option Swagger khác.

```ts
const document = createScopedSwaggerDocument(app, options, {
  include: [ClientModule],
});
configSwaggerDocument(app, document, "swagger");
```

Không có `include` thì cả hai cách đều xuất toàn bộ route. Module không có
prefix vẫn dùng `SwaggerModule.createDocument` bình thường.

### `configSwaggerDocument(app, document, path?)`

Merge metadata `class-validator` vào `document.components.schemas` và mount Swagger UI tại `path`.

**Chữ ký**

```ts
function configSwaggerDocument(
  app: INestApplication,
  document: OpenAPIObject,
  swaggerPath?: string,
): void;
```

**Tham số**

| Tên           | Kiểu               | Bắt buộc | Mặc định      | Mô tả                                                                                                                                                       |
| ------------- | ------------------ | :------: | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`         | `INestApplication` |    ✔     | —             | Instance app Nest.                                                                                                                                            |
| `document`    | `OpenAPIObject`    |    ✔     | —             | Document do một trong hai factory Swagger sinh ra; thiếu `components.schemas` sẽ được tạo.                                             |
| `swaggerPath` | `string`           |          | `"swagger"`   | Đường dẫn mount Swagger UI. `GET /<path>` trả HTML, `GET /<path>-json` trả JSON document (behaviour mặc định của `SwaggerModule.setup`).                    |

**Trả về** — `void` (side effect: mutate `document.components.schemas` và đăng ký route).

**Cách hoạt động (từng bước)**

1. Đọc metadata global của `class-validator`, kể cả khi app dùng Nest `useContainer()` mà không đăng ký provider `MetadataStorage`.
2. Chạy `validationMetadatasToSchemas` với reference prefix `#/components/schemas/`.
3. Bổ sung DTO/property còn thiếu mà không ghi đè property của Swagger; gộp hai mảng `required`.
4. Gọi `SwaggerModule.setup(swaggerPath, app, document)`.

**Lỗi hay gặp**

- Property và `required` do Swagger tạo được giữ lại; chỉ bổ sung trường còn thiếu.
- Gọi `configSwaggerDocument` **một lần**. Gọi hai lần đăng ký cùng path, Nest sẽ warn.
- Decorator class-validator trên class không reachable từ controller vẫn lên `components.schemas` — `class-validator-jsonschema` đọc từ global metadata storage, không đọc qua controller.

## Pattern thường dùng

### Loại DTO nội bộ khỏi doc

`class-validator-jsonschema` không biết DTO nào là "public". Workaround: giữ DTO nội bộ ở module riêng và config swagger có điều kiện.

Cách đơn giản hơn: trước khi gọi `configSwaggerDocument`, xoá entry không muốn:

```ts
const document = SwaggerModule.createDocument(app, options);
delete document.components!.schemas!.InternalThing;
configSwaggerDocument(app, document);
```

### Thêm model không được reference

Nếu DTO chỉ dùng làm generic param (`PaginatedResponse<BookDto>`) Swagger đôi khi bỏ sót. Ép include qua `extraModels` của `createDocument`:

```ts
const document = SwaggerModule.createDocument(app, options, {
  extraModels: [PaginatedResponse, BookDto],
});
configSwaggerDocument(app, document);
```

### Đổi mount path

```ts
configSwaggerDocument(app, document, "docs");        // GET /docs
configSwaggerDocument(app, document, "api/v1/docs"); // GET /api/v1/docs
```

JSON raw tương ứng ở `/docs-json` / `/api/v1/docs-json` theo convention mặc định của Nest.
