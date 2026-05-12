import {
  initializeTransactionalContext,
  addTransactionalDataSource,
  StorageDriver,
  Propagation,
  IsolationLevel,
} from "../../vendor/transactional";

export interface SetupTransactionContextOptions {
  /**
   * Maximum number of hook handlers (`commit`, `rollback`, `complete`) allowed
   * simultaneously. Defaults to `10`.
   */
  maxHookHandlers?: number;
}

/**
 * Initialise the transactional context.
 *
 * Must be called in `main.ts` BEFORE `NestFactory.create`.
 *
 * The vendored fork of `typeorm-transactional` shipped with this package only
 * supports `AsyncLocalStorage` (Node 16.4+ / Bun) — there is no `cls-hooked`
 * fallback, so there is no `storageDriver` option to configure.
 */
export function setupTransactionContext(
  options: SetupTransactionContextOptions = {}
) {
  const { maxHookHandlers } = options;
  initializeTransactionalContext(
    maxHookHandlers !== undefined ? { maxHookHandlers } : undefined
  );
}

export {
  addTransactionalDataSource,
  StorageDriver,
  Propagation,
  IsolationLevel,
};
