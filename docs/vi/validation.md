# Decorator validation

[← Quay lại index](../README.md) · [English](../en/validation.md)

Trang này bao gồm 3 helper validation do `nestjs-typeorm3-kit` cung cấp: `@IsNumber`, `@IsPhoneNumber`, `@IsLongerThan`. Đây là các wrapper mỏng quanh `class-validator` + `class-transformer`, fix các lỗi hay quên (`@Type`, `@IsOptional`, so sánh field chéo).

## Tổng quan

Cả 3 chạy mượt với `ValidationPipe` của Nest. Dùng trên DTO class trong `@Body()`, `@Query()`, `@Param()`.

```ts
import { ValidationPipe } from "@nestjs/common";

app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
```

`transform: true` chính là cái cho phép `@Type()` coercion mà các helper áp dụng.

## Tham chiếu API

### `@IsNumber(options?)`

Ép property về `number` (để query string như `?limit=10` hoạt động) và validate bằng `IsNumber({ allowNaN: false })` của `class-validator`. Mặc định optional.

**Chữ ký**

```ts
function IsNumber(options?: IValidationOptions): PropertyDecorator;
```

**`IValidationOptions`** (extends `ValidationOptions` của `class-validator`)

| Field            | Kiểu       | Mặc định | Mô tả                                                                                                  |
| ---------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `required`       | `boolean`  | `false`  | Khi `false`, áp `@IsOptional({ each: true })` để field pass validation khi `undefined`/missing.       |
| `each`           | `boolean`  | —        | Kế thừa. Validate từng phần tử array.                                                                  |
| `message`        | …          | —        | Kế thừa. Custom error message.                                                                          |
| `groups`         | `string[]` | —        | Kế thừa. Validation groups.                                                                             |
| `always`         | `boolean`  | —        | Kế thừa.                                                                                                |
| `context`        | `any`      | —        | Kế thừa.                                                                                                |

**Tương đương:**

```ts
@Type(() => Number)
@IsOptional({ each: true })          // chỉ khi required === false
@IsNumber({ allowNaN: false }, opts) // IsNumber của class-validator
```

**Ví dụ**

```ts
class Query {
  @IsNumber() page?: number;                       // optional
  @IsNumber({ required: true }) limit!: number;    // bắt buộc
  @IsNumber({ each: true }) ids?: number[];        // mảng số
}
```

**Lỗi hay gặp**

- Coercion chỉ chạy khi `ValidationPipe({ transform: true })` bật. Không có nó thì query string vẫn là string và `@IsNumber` fail.
- `required: false` làm field optional **toàn cục**. Để chỉ required trong một validation group, dùng `groups: ["create"]`.

---

### `@IsPhoneNumber(region, options?)`

Cast value sang `String` và delegate xuống `IsPhoneNumber(region, options)` của `class-validator`. Cast là điểm khác biệt — không có nó, số phone từ JSON (number) sẽ fail regex.

**Chữ ký**

```ts
function IsPhoneNumber(
  region: CountryCode,
  validationOptions?: ValidationOptions,
): PropertyDecorator;
```

**Tham số**

| Tên       | Kiểu                | Bắt buộc | Mô tả                                                                                                      |
| --------- | ------------------- | :------: | ---------------------------------------------------------------------------------------------------------- |
| `region`  | `CountryCode`       |    ✔     | Mã nước ISO 3166-1 alpha-2 (`"VN"`, `"US"`, `"GB"`, …). Từ `libphonenumber-js`.                            |
| `options` | `ValidationOptions` |          | Validation options chuẩn của `class-validator` (`message`, `each`, `groups`, …).                            |

**Tương đương:**

```ts
@Type(() => String)
@IsPhoneNumber(region, options) // IsPhoneNumber của class-validator
```

**Ví dụ**

```ts
class Profile {
  @IsPhoneNumber("VN") phone!: string;
  @IsPhoneNumber("US", { each: true }) altPhones?: string[];
}
```

**Lỗi hay gặp**

- Decorator **không tự** optional. Muốn optional thì kết hợp `@IsOptional()`.
- `region` bắt buộc — không có chế độ auto-detect. Kể cả input có prefix nước (`+84…`) bạn vẫn phải truyền region; chọn default hợp lý và parse phía server nếu cần.

---

### `@IsLongerThan(otherProperty, options?)`

Đăng ký custom validator pass khi string của decorated field **dài hơn nghiêm ngặt** một field string khác cùng object. Hữu ích kiểm độ dài `newPassword` so với `oldPassword`, v.v.

**Chữ ký**

```ts
function IsLongerThan(
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator;
```

**Tham số**

| Tên        | Kiểu                | Bắt buộc | Mặc định                                                | Mô tả                                                       |
| ---------- | ------------------- | :------: | ------------------------------------------------------- | ----------------------------------------------------------- |
| `property` | `string`            |    ✔     | —                                                       | Tên field anh em cùng object để so sánh.                    |
| `options`  | `ValidationOptions` |          | `{ message: "<prop> must be longer than <other>" }`     | Options chuẩn.                                              |

**Behaviour**

Pass khi **cả hai** value là string và `value.length > relatedValue.length`. Ngược lại fail. **Không** coerce — non-string luôn fail.

**Ví dụ**

```ts
class ResetPasswordDto {
  @IsString() oldPassword!: string;

  @IsString()
  @IsLongerThan("oldPassword")
  newPassword!: string;
}
```

**Lỗi hay gặp**

- `IsLongerThan` không tự kéo theo `@IsString`. Kết hợp `@IsString()` để fail sớm với type sai.
- "Dài hơn" tính theo **length**, không lexicographic. Cần so lexicographic thì viết custom validator riêng.
- Field so sánh đọc trực tiếp từ object validate — không reach được object lồng nhau (`@IsLongerThan("inner.foo")` không hoạt động).

## Pattern thường dùng

### Kết hợp với mặc định `class-transformer`

`@IsNumber` và `@IsPhoneNumber` đã tự apply `@Type()`. Nếu cần thêm `@Transform()` để normalise (trim, lower-case), đặt **trước** helper:

```ts
@Transform(({ value }) => value?.toString().trim())
@IsPhoneNumber("VN")
phone!: string;
```

### Yêu cầu theo group

```ts
class UserDto {
  @IsNumber({ groups: ["create"] }) age!: number; // chỉ bắt buộc khi validate group "create"
}

validate(dto, { groups: ["create"] });
```
