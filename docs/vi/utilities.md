# Tiện ích (Utilities)

[← Quay lại index](../README.md) · [English](../en/utilities.md)

Trang này gom các helper còn lại: `lazyLoadClasses` để auto-discover controller/service, và ghi chú về 2 decorator legacy `@Emoji` / `@NewClass` trong `common`.

## Tổng quan

Đây là các tiện ích nhỏ — không bắt buộc để dùng kit, nhưng giúp giảm barrel-file boilerplate hoặc document lý do class tồn tại.

## Tham chiếu API

### `lazyLoadClasses(baseDir, suffixes, additional?)`

Quét **các subdirectory trực tiếp** của `baseDir` tìm file khớp suffix (ví dụ `.controller`, `.service`) và trả về **class export đầu tiên** của mỗi file. Hữu ích để tạo mảng `controllers`/`providers` mà không cần giữ barrel `index.ts` cho mỗi folder.

**Chữ ký**

```ts
function lazyLoadClasses(
  baseDir: string,
  suffixes: string[],
  additionalClasses?: Type<any>[],
): Type<any>[];
```

**Tham số**

| Tên                 | Kiểu          | Bắt buộc | Mặc định | Mô tả                                                                                                                                          |
| ------------------- | ------------- | :------: | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseDir`           | `string`      |    ✔     | —        | Đường dẫn tuyệt đối để quét (thường là `__dirname` của module).                                                                                  |
| `suffixes`          | `string[]`    |    ✔     | —        | Suffix file cần match. Match `<name>.<suffix>.ts` và `.js`. Ví dụ: `[".controller"]` match `book.controller.ts`, `auth.controller.ts`.          |
| `additionalClasses` | `Type<any>[]` |          | `[]`     | Class extra prepend vào danh sách. Hữu ích khi một class nằm ngoài convention.                                                                  |

**Trả về** — mảng class constructor sẵn sàng cho `controllers: [...]` / `providers: [...]`.

**Behaviour**

1. List các subdirectory trực tiếp của `baseDir`.
2. Trong mỗi subdir, list file. Lấy file kết thúc bằng `<suffix>.ts` hoặc `<suffix>.js`.
3. Mỗi file match → `require()` (đường dẫn được strip extension trước).
4. Lấy `Object.values(module)[0]` làm class đăng ký.
5. Lỗi load → `console.warn`. File hỏng bị skip, không throw.

**Ví dụ**

```ts
import { lazyLoadClasses } from "nestjs-typeorm3-kit";

@Module({
  controllers: lazyLoadClasses(__dirname, [".controller"], [HealthController]),
  providers: lazyLoadClasses(__dirname, [".service"]),
})
export class ClientModule {}
```

**Lỗi hay gặp**

- **Chỉ lấy export đầu tiên.** File export nhiều thứ thì chỉ thứ đầu được lấy. Một class một file, hoặc dùng helper khác.
- **Quét đúng một cấp.** `__dirname/foo/bar/x.controller.ts` không được tìm thấy nếu `__dirname/foo/bar/` không phải subdir trực tiếp, và file nằm ngay trong `baseDir` cũng không được quét.
- Lỗi chỉ warn, không throw. Typo trong file controller sẽ âm thầm biến mất khỏi registry — chú ý log.
- Dùng `require` (đồng bộ). Chạy được khi app là CommonJS (`ts-node`, dist/ compiled), nhưng không chạy khi app chạy dưới dạng ESM (`"type": "module"`, Jest chế độ ESM): không có `require`, nên mọi file đều load lỗi và chỉ có cảnh báo trong log.
- File extension bị strip trước `require`; cả `.ts` và `.js` đều OK, nhưng app NestJS compiled thường chỉ cần `.js`.

---

### `@Emoji()` (common)

```ts
@Emoji() flavor = "vanilla"; // gán "next" sẽ lưu "🍦 next 🍦"
```

Property decorator còn sót lại từ thử nghiệm cũ. Thay property bằng getter/setter, khi `set` thì bọc value bằng emoji 🍦. **Không thuộc API khuyến nghị**; coi như curiosity.

**Lỗi hay gặp.** Nó mutate property descriptor — kết hợp với decorator khác (hoặc framework reactive) có thể ra kết quả bất ngờ. Đừng dùng trong code production.

---

### `@NewClass()` (common)

```ts
@NewClass()
class Foo {}
```

Class decorator bọc constructor bằng một instance-factory. Output behave giống class gốc nhưng đi qua một function call thừa. **Không thuộc API khuyến nghị**; nếu bạn có use case hợp lý, mở issue để document.

## Pattern thường dùng

### Auto-load provider qua nhiều module

```ts
import { join } from "path";
import { lazyLoadClasses } from "nestjs-typeorm3-kit";

@Module({
  controllers: lazyLoadClasses(__dirname, [".controller"]),
  providers: [
    ...lazyLoadClasses(__dirname, [".service"]),
    ...lazyLoadClasses(join(__dirname, "../shared"), [".service"]),
  ],
})
export class ApiModule {}
```

### Khi nào dùng barrel tường minh

`lazyLoadClasses` tiện nhưng ẩn việc class nào được load. Nếu module nhỏ hoặc cần ổn định cao, hãy dùng barrel `index.ts` tường minh (re-export từng class) — gõ chậm hơn nhưng debug nhanh hơn.
