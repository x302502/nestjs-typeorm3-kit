import type { EntityManager, QueryRunner } from 'typeorm';

import { DataSourceName } from '../common';
import { TYPEORM_DATA_SOURCE_NAME_PREFIX } from '../common/constants';
import type { StorageDriver } from '../storage/driver/interface';

/**
 * FIFO lock serializing savepoints opened directly under one transaction.
 */
export class NestedScope {
  private tail: Promise<void> = Promise.resolve();

  constructor(readonly queryRunner: QueryRunner | undefined) {}

  async acquire(): Promise<() => void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    return release;
  }
}

const rootScopes = new WeakMap<QueryRunner, NestedScope>();

const scopeKey = (name: DataSourceName) => TYPEORM_DATA_SOURCE_NAME_PREFIX + name + '/nested-scope';

/**
 * Called inside a transaction body: savepoints requested by this body (or its
 * descendants) queue on a scope owned by this transaction.
 */
export const setNestedScope = (
  context: StorageDriver,
  name: DataSourceName,
  entityManager: EntityManager,
) => {
  context.set(scopeKey(name), new NestedScope(entityManager.queryRunner));
};

export const getNestedScope = (
  context: StorageDriver,
  name: DataSourceName,
  currentTransaction: EntityManager,
): NestedScope => {
  const queryRunner = currentTransaction.queryRunner;
  const scoped = context.get(scopeKey(name)) as NestedScope | undefined;
  if (scoped && scoped.queryRunner === queryRunner) return scoped;

  if (!queryRunner) return new NestedScope(undefined);

  let root = rootScopes.get(queryRunner);
  if (!root) {
    root = new NestedScope(queryRunner);
    rootScopes.set(queryRunner, root);
  }

  return root;
};
