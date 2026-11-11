# Utilities

[← Back to docs index](../README.md) · [Tiếng Việt](../vi/utilities.md)

This page covers the remaining helpers: `lazyLoadClasses` for auto-discovering controllers/services, and notes on the legacy `@Emoji` / `@NewClass` decorators in `common`.

## Overview

These are small ergonomics — none of them are required to use the kit, but they reduce barrel-file boilerplate or document why a class exists.

## API reference

### `lazyLoadClasses(baseDir, suffixes, additional?)`

Scans the immediate subdirectories of `baseDir` for files matching the given suffixes (e.g. `.controller`, `.service`) and returns the **first exported class** from each. Useful to generate `controllers`/`providers` arrays without keeping a barrel `index.ts` per folder.

**Signature**

```ts
function lazyLoadClasses(
  baseDir: string,
  suffixes: string[],
  additionalClasses?: Type<any>[],
): Type<any>[];
```

**Parameters**

| Name                | Type           | Required | Default | Description                                                                                                                                  |
| ------------------- | -------------- | :------: | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseDir`           | `string`       |    ✔     | —       | Absolute path to scan (usually `__dirname` of the module).                                                                                    |
| `suffixes`          | `string[]`     |    ✔     | —       | File suffixes to match. Matches `<name>.<suffix>.ts` and `.js`. Example: `[".controller"]` matches `book.controller.ts`, `auth.controller.ts`. |
| `additionalClasses` | `Type<any>[]`  |          | `[]`    | Extra classes to prepend to the discovered list. Useful when one class lives outside the convention.                                          |

**Returns** — array of class constructors ready to be passed to `controllers: [...]` / `providers: [...]`.

**Behaviour**

1. Lists immediate subdirectories of `baseDir`.
2. In each subdirectory, lists files. Picks files whose name ends with `<suffix>.ts` or `<suffix>.js`.
3. For each matching file, `require()`s it (the path is stripped of its extension first).
4. Takes `Object.values(module)[0]` as the class to register.
5. Wraps any load failure with `console.warn` — the bad file is skipped, not thrown.

**Example**

```ts
import { lazyLoadClasses } from "nestjs-typeorm3-kit";

@Module({
  controllers: lazyLoadClasses(__dirname, [".controller"], [HealthController]),
  providers: lazyLoadClasses(__dirname, [".service"]),
})
export class ClientModule {}
```

**Pitfalls**

- **Only the first export wins.** If a file exports multiple values, only the first enumerable export is taken. Keep one class per file or pick a different helper.
- Scans **one level deep only.** `__dirname/foo/bar/x.controller.ts` is not discovered if `__dirname/foo/bar/` is not a direct subdirectory, and files placed directly in `baseDir` are not scanned either.
- Failures are warned, not thrown. A typo in a controller file silently disappears from the registry — keep an eye on the logs.
- Uses `require` (sync). It works in CommonJS setups (`ts-node`, compiled `dist/`), but not when your app runs as ESM (`"type": "module"`, Jest ESM mode): there is no `require`, so every file fails to load and only a warning is logged.
- The file's filename ext is stripped before `require`; both `.ts` and `.js` work, but in a compiled NestJS app you typically only need `.js`.

---

### `@Emoji()` (common)

```ts
@Emoji() flavor = "vanilla"; // assigning "next" stores "🍦 next 🍦"
```

A property decorator kept from earlier experiments. It replaces the property with a getter/setter that wraps the assigned value in 🍦 emoji on `set`. It is **not part of the recommended API**; consider it a curiosity.

**Pitfall.** It mutates the property descriptor — combining it with other property decorators (or with reactive frameworks) can have surprising effects. Don't use this in production code.

---

### `@NewClass()` (common)

```ts
@NewClass()
class Foo {}
```

A class decorator that wraps the constructor in an instance-factory. The output behaves identically to the original class but goes through an extra function call. **Not part of the recommended API**; if you find a legitimate use case, file an issue and we'll document it.

## Patterns

### Auto-loading providers across module borders

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

### Preferring an explicit barrel

`lazyLoadClasses` is convenient but hides which classes are loaded. If your module is small or stability-critical, prefer an explicit barrel file (`index.ts` that re-exports each class) — it's slower to type but faster to debug.
