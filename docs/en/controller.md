# Controllers, method decorators & `@ChildModule`

[← Back to docs index](../README.md) · [Tiếng Việt](../vi/controller.md)

This page covers `@DefController`, the HTTP method decorators (`@DefGet`, `@DefPost`, `@DefPut`, `@DefPatch`, `@DefDelete`), and the `@ChildModule` decorator that mounts a Nest module under a route prefix while auto-tagging Swagger groups.

## Overview

Nest's stock `@Controller`/`@Get`/`@Post`/... force you to also remember `@ApiBearerAuth`, `@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@HttpCode`. The kit's decorators bundle all of that into one call per method, so the controller code stays focused on routing and the Swagger metadata lives next to it.

## Quick example

```ts
import { Body, Query, Param } from "@nestjs/common";
import {
  DefController,
  DefGet, DefPost, DefPatch, DefDelete,
} from "nestjs-typeorm3-kit";

@DefController("books")
export class BookController {
  constructor(private readonly svc: BookService) {}

  @DefGet("", { summary: "List books", responseType: [BookDto] })
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

## API reference

### `@DefController(prefix?)`

A drop-in replacement for `@Controller(...)` that also applies `@ApiBearerAuth()` automatically. Anything you can pass to `@Controller` you can pass here.

**Signatures**

```ts
function DefController(prefix?: string | string[]): ClassDecorator;
function DefController(options: ControllerOptions): ClassDecorator;
```

**Parameters**

| Name              | Type                                          | Required | Default | Description                                                          |
| ----------------- | --------------------------------------------- | :------: | ------- | -------------------------------------------------------------------- |
| `prefix` / `options` | `string \| string[] \| ControllerOptions`  |          | `"/"`   | Route prefix (or full `ControllerOptions` with `path`, `version`, …). |

**Equivalent to:**

```ts
@Controller(prefix)
@ApiBearerAuth()
class FooController {}
```

**Pitfall.** `@DefController` always adds Bearer auth in Swagger. If a controller is genuinely public, plain `@Controller` is the better choice — otherwise readers think the endpoint requires a token.

---

### `@DefGet(path?, options?)`

Combines `@Get`, `@HttpCode`, `@ApiOperation`, `@ApiResponse`.

**Signature**

```ts
function DefGet(
  path?: string | string[],
  options?: MethodGetOptions,
): MethodDecorator;
```

**`MethodGetOptions`**

| Field          | Type                                          | Default         | Description                                                              |
| -------------- | --------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `summary`      | `string`                                      | `""`            | Forwarded to `@ApiOperation({ summary })`.                               |
| `statusCode`   | `HttpStatus`                                  | `HttpStatus.OK` | Forwarded to `@HttpCode` and `@ApiResponse({ status })`.                 |
| `responseType` | `Type \| Function \| [Function] \| string`    | `undefined`     | Forwarded to `@ApiResponse({ type })`. Use `[BookDto]` for arrays.       |

---

### `@DefPost(path?, options?)` · `@DefPut` · `@DefPatch` · `@DefDelete`

Same shape as `@DefGet`, plus a `bodyType` option that adds `@ApiBody({ type: bodyType })`.

**Signature**

```ts
function DefPost(
  path?: string | string[],
  options?: MethodOptions,
): MethodDecorator;
// Identical signatures for DefPut, DefPatch, DefDelete.
```

**`MethodOptions`** (extends `MethodGetOptions`)

| Field          | Type                                          | Default         | Description                                                |
| -------------- | --------------------------------------------- | --------------- | ---------------------------------------------------------- |
| `summary`      | `string`                                      | `""`            | `@ApiOperation({ summary })`.                              |
| `statusCode`   | `HttpStatus`                                  | `HttpStatus.OK` | `@HttpCode` and `@ApiResponse({ status })`.                |
| `responseType` | `Type \| Function \| [Function] \| string`    | `undefined`     | `@ApiResponse({ type })`.                                  |
| `bodyType`     | `Type \| Function \| [Function] \| string`    | `undefined`     | `@ApiBody({ type })`. Helpful when the DTO can't be inferred from `@Body()`. |

**Pitfalls**

- `statusCode` defaults to `200` even for `@DefPost`/`@DefDelete` — set it explicitly (`201`, `204`) when the operation isn't a generic OK.
- `bodyType: undefined` is a no-op; the `@ApiBody` call is only emitted when you actually pass a type.

---

### `@ChildModule(metadata)`

A `@Module`-like decorator that **also**:

1. Sets `MODULE_PATH` metadata on the module class with the normalised prefix (`/abc/v1`).
2. Propagates the prefix down to every imported module — so a `@ChildModule({ prefix: "outer" })` that imports a `@ChildModule({ prefix: "inner" })` ends up with the inner mounted at `/outer/inner`.
3. Adds `@ApiTags("[PascalPrefix] ControllerName")` to every controller listed in `controllers`.

**Signature**

```ts
function ChildModule(metadata: IChildModuleMetadata): ClassDecorator;
```

**`IChildModuleMetadata`** (extends `ModuleMetadata`)

| Field         | Type                       | Default | Description                                                                                       |
| ------------- | -------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `prefix`      | `string`                   | `""`    | Route prefix segment. Slashes are normalised (`//foo//` → `foo`).                                  |
| `imports`     | `ModuleMetadata["imports"]`     | `[]`    | Same as `@Module`. The prefix is propagated onto these imports.                              |
| `controllers` | `ModuleMetadata["controllers"]` | `[]`    | Same as `@Module`. Each controller is auto-tagged in Swagger.                                |
| `providers`   | `ModuleMetadata["providers"]`   | `[]`    | Same as `@Module`. Untouched by the prefix logic.                                            |
| `exports`     | `ModuleMetadata["exports"]`     | `[]`    | Same as `@Module`.                                                                          |

**Example**

```ts
@ChildModule({
  prefix: "client",
  imports: [PrimaryRepoModule, SecondaryRepoModule],
  controllers: [BookController, AuthorController],
  providers: [BookService, AuthorService],
})
export class ClientModule {}
```

Routes become `/client/books`, `/client/authors`. Swagger groups: `[Client] BookController`, `[Client] AuthorController`.

**Pitfalls**

- Imported modules that register controllers (directly or through their imports) are scoped to each parent's route prefix: reusing such a child under two parents mounts two module instances, and the providers declared in that module are created once per mount. Modules without controllers (services, repository modules, `@Global` modules) are shared, so their providers stay singletons — keep shared state (caches, connections) in a route-less module.
- To filter Swagger routes with `include: [ChildModuleClass]` across prefixed mounts, call `createScopedSwaggerDocument` instead of `SwaggerModule.createDocument`. The latter compares class identity and misses scoped copies; `include: [ParentModule]` with `deepScanRoutes: true` only scans its direct imports.
- Standalone `@Controller` (without `@DefController`) is still tagged, but the Bearer-auth requirement won't be added.

## Patterns

### Versioned API mounts

```ts
@ChildModule({ prefix: "api/v1", imports: [V1ClientModule] })
export class V1RootModule {}
```

Combined with Nest's URI versioning you can keep different controller sets per version.

### Disabling Bearer auth on one endpoint

`@DefController` always applies `@ApiBearerAuth()`, and method-level security decorators are added on top of it rather than replacing it (`@ApiSecurity('none')` leaves `bearer` in place and references a `none` scheme that does not exist). Put public routes in a controller decorated with plain `@Controller` instead. The Bearer tag in Swagger is purely documentation; it does not enforce auth — that's still your guards' job.
