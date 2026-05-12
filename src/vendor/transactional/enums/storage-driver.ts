/**
 * Enumeration of available storage drivers.
 *
 * This vendored fork removed the `cls-hooked` driver. Only AsyncLocalStorage
 * is supported, which requires Node.js 16.4+ or Bun.
 *
 * Kept as an enum for API compatibility with upstream `typeorm-transactional`.
 */
export enum StorageDriver {
  /**
   * @deprecated Now identical to {@link ASYNC_LOCAL_STORAGE}. Kept for backwards
   * compatibility with code that passes `StorageDriver.AUTO`.
   */
  AUTO = 'AUTO',

  /**
   * Uses Node's built-in `AsyncLocalStorage` (Node.js 16.4+ / Bun).
   */
  ASYNC_LOCAL_STORAGE = 'ASYNC_LOCAL_STORAGE',
}
