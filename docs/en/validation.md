# Validation decorators

[← Back to docs index](../README.md) · [Tiếng Việt](../vi/validation.md)

This page covers the three validation helpers shipped by `nestjs-typeorm3-kit`: `@IsNumber`, `@IsPhoneNumber`, `@IsLongerThan`. They are thin wrappers over `class-validator` + `class-transformer` that fix common gotchas (forgotten `@Type`, forgotten `@IsOptional`, missing cross-field comparison).

## Overview

All three integrate seamlessly with Nest's `ValidationPipe`. Use them on DTO classes used in `@Body()`, `@Query()`, `@Param()`.

```ts
import { ValidationPipe } from "@nestjs/common";

app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
```

`transform: true` is what enables the `@Type()` coercion these helpers apply.

## API reference

### `@IsNumber(options?)`

Coerces the property to a `number` (so query strings like `?limit=10` work) and validates with `class-validator`'s `IsNumber({ allowNaN: false })`. Optional by default.

**Signature**

```ts
function IsNumber(options?: IValidationOptions): PropertyDecorator;
```

**`IValidationOptions`** (extends `class-validator`'s `ValidationOptions`)

| Field            | Type      | Default | Description                                                                                                  |
| ---------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `required`       | `boolean` | `false` | When `false`, applies `@IsOptional({ each: true })` so the field passes validation when `undefined`/missing. |
| `each`           | `boolean` | —       | Inherited from `ValidationOptions`. Validate every element of an array.                                       |
| `message`        | …         | —       | Inherited. Custom error message.                                                                              |
| `groups`         | `string[]` | —      | Inherited. Validation groups.                                                                                 |
| `always`         | `boolean` | —       | Inherited.                                                                                                    |
| `context`        | `any`     | —       | Inherited.                                                                                                    |

**Equivalent to:**

```ts
@Type(() => Number)
@IsOptional({ each: true })          // only when required === false
@IsNumber({ allowNaN: false }, opts) // class-validator's IsNumber
```

**Examples**

```ts
class Query {
  @IsNumber() page?: number;                       // optional
  @IsNumber({ required: true }) limit!: number;    // required
  @IsNumber({ each: true }) ids?: number[];        // array of numbers
}
```

**Pitfalls**

- The coercion only fires when `ValidationPipe({ transform: true })` is enabled. Without that, querystring values stay strings and `@IsNumber` fails.
- `required: false` makes the field optional **globally**. To require it only in one validation group, use `groups: ["create"]` etc.

---

### `@IsPhoneNumber(region, options?)`

Casts the value to `String` and delegates to `class-validator`'s `IsPhoneNumber(region, options)`. The cast is what's distinctive — without it, numeric phone inputs from JSON get treated as `number` and fail the regex.

**Signature**

```ts
function IsPhoneNumber(
  region: CountryCode,
  validationOptions?: ValidationOptions,
): PropertyDecorator;
```

**Parameters**

| Name      | Type                | Required | Description                                                                                                                          |
| --------- | ------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| `region`  | `CountryCode`       |    ✔     | ISO 3166-1 alpha-2 country code (`"VN"`, `"US"`, `"GB"`, …). From `libphonenumber-js`.                                               |
| `options` | `ValidationOptions` |          | Standard `class-validator` validation options (`message`, `each`, `groups`, …).                                                       |

**Equivalent to:**

```ts
@Type(() => String)
@IsPhoneNumber(region, options) // class-validator's IsPhoneNumber
```

**Examples**

```ts
class Profile {
  @IsPhoneNumber("VN") phone!: string;
  @IsPhoneNumber("US", { each: true }) altPhones?: string[];
}
```

**Pitfalls**

- The decorator is **not optional** by default. If you want it optional, combine with `@IsOptional()`.
- `region` is required — there is no auto-detect mode. If your input contains the country prefix (`+84…`) you still must pass a region; pick a sensible default and parse server-side if needed.

---

### `@IsLongerThan(otherProperty, options?)`

Registers a custom validator that passes when the decorated string is **strictly longer** than another string property on the same object. Useful for `newPassword` length checks against `oldPassword`, etc.

**Signature**

```ts
function IsLongerThan(
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator;
```

**Parameters**

| Name       | Type                | Required | Default                                                | Description                                                  |
| ---------- | ------------------- | :------: | ------------------------------------------------------ | ------------------------------------------------------------ |
| `property` | `string`            |    ✔     | —                                                      | Name of the sibling property to compare against (same object). |
| `options`  | `ValidationOptions` |          | `{ message: "<prop> must be longer than <other>" }`    | Standard options.                                            |

**Behaviour**

Passes when **both** values are strings and `value.length > relatedValue.length`. Otherwise fails. Coercion is **not** performed — non-string inputs always fail.

**Examples**

```ts
class ResetPasswordDto {
  @IsString() oldPassword!: string;

  @IsString()
  @IsLongerThan("oldPassword")
  newPassword!: string;
}
```

**Pitfalls**

- `IsLongerThan` does not imply `@IsString`. Combine with `@IsString()` to fail fast on wrong types.
- "Strictly longer" is **length-based**, not lexicographic. To compare lexicographically, write a separate custom validator.
- The compared property is read directly from the validated object — it can't reach into nested objects (`@IsLongerThan("inner.foo")` will not work).

## Patterns

### Combining with `class-transformer` defaults

`@IsNumber` and `@IsPhoneNumber` apply `@Type()` automatically. If you also need `@Transform()` for normalisation (trimming, lower-casing), put it before the helper:

```ts
@Transform(({ value }) => value?.toString().trim())
@IsPhoneNumber("VN")
phone!: string;
```

### Conditional requirement via groups

```ts
class UserDto {
  @IsNumber({ groups: ["create"] }) age!: number; // required only when validating with group "create"
}

validate(dto, { groups: ["create"] });
```
