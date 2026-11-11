import type { EventEmitter } from 'events';
import { DataSource, EntityManager } from 'typeorm';
import {
  DataSourceName,
  getDataSourceByName,
  getEntityManagerByDataSourceName,
  getHookByDataSourceName,
  getHookInContext,
  getTransactionalContext,
  setEntityManagerByDataSourceName,
  setHookInContext,
} from '../common';

import { IsolationLevel } from '../enums/isolation-level';
import { Propagation } from '../enums/propagation';
import { runInNewHookContext } from '../hooks';
import { NestedScope, getNestedScope, setNestedScope } from './nested-scope';
import { TransactionalError } from '../errors/transactional';

export interface WrapInTransactionOptions {
  /**
   * For compatibility with `typeorm-transactional-cls-hooked` we use `connectionName`
   */
  connectionName?: DataSourceName | (() => DataSourceName | undefined);

  propagation?: Propagation;

  isolationLevel?: IsolationLevel;

  name?: string | symbol;
}

export const wrapInTransaction = <Fn extends (this: any, ...args: any[]) => ReturnType<Fn>>(
  fn: Fn,
  options?: WrapInTransactionOptions,
) => {
  // eslint-disable-next-line func-style
  function wrapper(this: unknown, ...args: unknown[]) {
    const context = getTransactionalContext();
    if (!context) {
      throw new Error(
        'No transaction context defined. Call setupTransactionContext() before application start.',
      );
    }

    const connectionName = (typeof options?.connectionName === 'function'
      ? options.connectionName()
      : options?.connectionName) ?? 'default';

    const dataSource = getDataSourceByName(connectionName);
    if (!dataSource) {
      throw new Error(
        'No data sources defined in your app ... please call addTransactionalDataSources() before application start.',
      );
    }

    const propagation = options?.propagation ?? Propagation.REQUIRED;
    const isolationLevel = options?.isolationLevel;

    const runOriginal = () => fn.apply(this, args);
    const runWithOwningHook = () => {
      const hook = getHookByDataSourceName(context, connectionName);
      if (!hook || hook === getHookInContext(context)) {
        return runOriginal();
      }
      return context.run(async () => {
        setHookInContext(context, hook);
        return runOriginal();
      });
    };
    const runWithNewHook = () => runInNewHookContext(context, runOriginal);

    const runWithNewTransaction = (
      transactionManager: DataSource | EntityManager = dataSource,
      parentHook?: EventEmitter,
    ) => {
      const transactionCallback = async (entityManager: EntityManager) => {
        setEntityManagerByDataSourceName(context, connectionName, entityManager);
        setNestedScope(context, connectionName, entityManager);

        try {
          const result = await runOriginal();

          return result;
        } finally {
          setEntityManagerByDataSourceName(context, connectionName, null);
        }
      };

      if (isolationLevel) {
        return runInNewHookContext(context, () => {
          return transactionManager.transaction(isolationLevel, transactionCallback);
        }, parentHook, connectionName);
      } else {
        return runInNewHookContext(context, () => {
          return transactionManager.transaction(transactionCallback);
        }, parentHook, connectionName);
      }
    };

    return context.run(async () => {
      const currentTransaction = getEntityManagerByDataSourceName(context, connectionName);
      switch (propagation) {
        case Propagation.MANDATORY:
          if (!currentTransaction) {
            throw new TransactionalError(
              "No existing transaction found for transaction marked with propagation 'MANDATORY'",
            );
          }

          return runWithOwningHook();

        case Propagation.NESTED:
          if (!currentTransaction) {
            return runWithNewTransaction();
          }

          // Savepoints share one query runner and a depth counter, so sibling
          // savepoints must be opened and closed one at a time.
          const scope: NestedScope = getNestedScope(context, connectionName, currentTransaction);
          const release = await scope.acquire();
          try {
            return await runWithNewTransaction(
              currentTransaction,
              getHookByDataSourceName(context, connectionName) ?? undefined,
            );
          } finally {
            release();
          }

        case Propagation.NEVER:
          if (currentTransaction) {
            throw new TransactionalError(
              "Found an existing transaction, transaction marked with propagation 'NEVER'",
            );
          }

          return runWithNewHook();

        case Propagation.NOT_SUPPORTED:
          if (currentTransaction) {
            setEntityManagerByDataSourceName(context, connectionName, null);
            const result = await runWithNewHook();
            setEntityManagerByDataSourceName(context, connectionName, currentTransaction);

            return result;
          }

          return runOriginal();

        case Propagation.REQUIRED:
          if (currentTransaction) {
            return runWithOwningHook();
          }

          return runWithNewTransaction();

        case Propagation.REQUIRES_NEW:
          return runWithNewTransaction();

        case Propagation.SUPPORTS:
          return currentTransaction ? runWithOwningHook() : runWithNewHook();
      }
    });
  }

  return wrapper as Fn;
};
