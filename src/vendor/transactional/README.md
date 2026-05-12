# Vendored `typeorm-transactional`

This directory contains a vendored fork of
[`typeorm-transactional`](https://github.com/Aliheym/typeorm-transactional) at
version **0.5.0**.

## Why vendor it?

- Removes the runtime dependency on `cls-hooked`, which relies on `async_hooks`
  in a way that **Bun does not implement**. The only storage backend kept here
  is Node's built-in `AsyncLocalStorage`, so transactions work on both Node
  (>= 16.4) and Bun.
- Removes the runtime dependency on `semver` (only used to pick a driver,
  which is no longer needed).
- Gives `nestjs-typeorm3-kit` a single public API surface — consumers no longer
  need to install `typeorm-transactional` separately.

## What was changed

- Deleted the entire `storage/driver/cls-hooked/` driver.
- Hard-coded `Storage` to construct `AsyncLocalStorageDriver`.
- `StorageDriver` enum reduced to `AUTO` (alias) and `ASYNC_LOCAL_STORAGE`.
- `TypeormTransactionalOptions.storageDriver` removed (no longer configurable —
  there is only one driver).
- Removed all `semver`/`cls-hooked` imports.

Everything else (decorators, hooks, propagation, isolation levels, patching
logic, error types) is **functionally identical** to upstream `v0.5.0`.

## License

The original `typeorm-transactional` is MIT-licensed. The license text is kept
verbatim in [./LICENSE](./LICENSE).
