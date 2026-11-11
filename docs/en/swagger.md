# Swagger integration

[← Back to docs index](../README.md) · [Tiếng Việt](../vi/swagger.md)

This page covers `createScopedSwaggerDocument` and `configSwaggerDocument`. They include every prefixed mount of a selected `ChildModule` and bridge `class-validator` metadata into the OpenAPI document.

## Overview

`@nestjs/swagger` builds OpenAPI schemas by reading `@ApiProperty()` decorators. It does **not** inspect `class-validator` decorators by default — so `@MinLength(3)`, `@IsEmail()`, `@IsInt()` etc. are invisible to the doc unless you write them twice.

`configSwaggerDocument` runs `validationMetadatasToSchemas` from `class-validator-jsonschema` and merges the result into the OpenAPI document's `components.schemas`, then calls `SwaggerModule.setup` to mount the UI.

> ⚠️ **Historical bug.** Versions before `0.2.0` had a typo (`{ key: value }` instead of `{ [key]: value }`) that merged *every* schema under the literal key `"key"`. If you copied that snippet into your own `main.ts`, replace it with this helper.

## Quick example

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

## API reference

### `createScopedSwaggerDocument(app, config, options?)`

Use this instead of `SwaggerModule.createDocument` when filtering by a public
`ChildModule` class. Nest mounts a child under different prefixes using separate
module classes; Swagger's regular `include` checks exact class identity and
would omit those prefixed copies. This helper expands `include` to all mounted
copies and otherwise delegates to Swagger unchanged.

```ts
const document = createScopedSwaggerDocument(app, options, {
  include: [ClientModule],
});
configSwaggerDocument(app, document, "swagger");
```

With no `include`, both document factories include all routes. For a regular
unprefixed module, `SwaggerModule.createDocument` still works as before.

### `configSwaggerDocument(app, document, path?)`

Merges `class-validator` metadata into `document.components.schemas` and mounts Swagger UI at `path`.

**Signature**

```ts
function configSwaggerDocument(
  app: INestApplication,
  document: OpenAPIObject,
  swaggerPath?: string,
): void;
```

**Parameters**

| Name          | Type               | Required | Default       | Description                                                                                                                                                  |
| ------------- | ------------------ | :------: | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app`         | `INestApplication` |    ✔     | —             | The Nest application instance.                                                                                                                                |
| `document`    | `OpenAPIObject`    |    ✔     | —             | The document produced by either Swagger document factory. Missing `components.schemas` is created.                                                                          |
| `swaggerPath` | `string`           |          | `"swagger"`   | URL path where Swagger UI is mounted. `GET /<path>` returns the HTML, `GET /<path>-json` returns the JSON document (default behaviour of `SwaggerModule.setup`). |

**Returns** — `void` (side effect: mutates `document.components.schemas` and registers routes).

**Behaviour, step by step**

1. Reads class-validator's global metadata storage; works with Nest `useContainer()` even without a registered `MetadataStorage` provider.
2. Runs `validationMetadatasToSchemas` with `#/components/schemas/` references.
3. Adds missing DTO schemas and properties without replacing Swagger's existing property definitions; merges both `required` arrays.
4. Calls `SwaggerModule.setup(swaggerPath, app, document)`.

**Pitfalls**

- Existing Swagger property definitions and `required` fields are preserved; only missing properties and required fields are added.
- Call `configSwaggerDocument` **once**. Calling twice re-registers the same path and Nest will warn.
- Class-validator decorators on classes that aren't reachable from your controllers will still end up in `components.schemas` — `class-validator-jsonschema` reads from the global metadata storage, not your controllers.

## Patterns

### Excluding internal DTOs from the doc

`class-validator-jsonschema` does not know which DTOs are "public". One workaround: keep internal DTOs in a separate module and conditionally configure swagger.

A simpler workaround: before calling `configSwaggerDocument`, delete the unwanted entries:

```ts
const document = SwaggerModule.createDocument(app, options);
delete document.components!.schemas!.InternalThing;
configSwaggerDocument(app, document);
```

### Adding extra models that aren't referenced

If a DTO is only used as a generic parameter (`PaginatedResponse<BookDto>`) Swagger sometimes misses it. Force-include via `createDocument`'s `extraModels`:

```ts
const document = SwaggerModule.createDocument(app, options, {
  extraModels: [PaginatedResponse, BookDto],
});
configSwaggerDocument(app, document);
```

### Customising the mount path

```ts
configSwaggerDocument(app, document, "docs");        // GET /docs
configSwaggerDocument(app, document, "api/v1/docs"); // GET /api/v1/docs
```

The corresponding raw JSON is at `/docs-json` / `/api/v1/docs-json` per Nest's default convention.
