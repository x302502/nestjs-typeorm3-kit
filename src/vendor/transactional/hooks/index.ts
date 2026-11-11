import { EventEmitter } from 'events';

import {
  getHookInContext,
  getTransactionalContext,
  getTransactionalOptions,
  setHookByDataSourceName,
  setHookInContext,
  DataSourceName,
} from '../common';
import { StorageDriver } from '../storage/driver/interface';

export const getTransactionalContextHook = () => {
  const context = getTransactionalContext();

  const emitter = getHookInContext(context);
  if (!emitter) {
    throw new Error('No hook manager found in context. Are you using @Transactional()?');
  }

  return emitter;
};

export const runAndTriggerHooks = async (
  hook: EventEmitter,
  cb: () => unknown,
  parentHook?: EventEmitter,
) => {
  try {
    const result = await Promise.resolve(cb());

    if (parentHook) {
      // A savepoint release is not a durable commit. Defer child hooks until
      // the surrounding transaction commits or rolls back.
      parentHook.once('commit', () => {
        hook.emit('commit');
        hook.emit('end', undefined);
        hook.removeAllListeners();
      });
      parentHook.once('rollback', (err: Error) => {
        hook.emit('rollback', err);
        hook.emit('end', err);
        hook.removeAllListeners();
      });
    } else {
      setImmediate(() => {
        hook.emit('commit');
        hook.emit('end', undefined);
        hook.removeAllListeners();
      });
    }

    return result;
  } catch (err) {
    setImmediate(() => {
      hook.emit('rollback', err);

      hook.emit('end', err);
      hook.removeAllListeners();
    });

    throw err;
  }
};

export const createEventEmitterInNewContext = (context: StorageDriver) => {
  const options = getTransactionalOptions();

  const emitter = new EventEmitter();
  emitter.setMaxListeners(options.maxHookHandlers);
  return emitter;
};

export const runInNewHookContext = async (
  context: StorageDriver,
  cb: () => unknown,
  parentHook?: EventEmitter,
  dataSourceName?: DataSourceName,
) => {
  const hook = createEventEmitterInNewContext(context);

  return await context.run(() => {
    setHookInContext(context, hook);
    if (dataSourceName !== undefined) {
      setHookByDataSourceName(context, dataSourceName, hook);
    }

    return runAndTriggerHooks(hook, cb, parentHook);
  });
};

export const runOnTransactionCommit = (cb: () => void) => {
  getTransactionalContextHook().once('commit', cb);
};

export const runOnTransactionRollback = (cb: (e: Error) => void) => {
  getTransactionalContextHook().once('rollback', cb);
};

export const runOnTransactionComplete = (cb: (e: Error | undefined) => void) => {
  getTransactionalContextHook().once('end', cb);
};
