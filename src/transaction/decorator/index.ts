import {
  IsolationLevel,
  Propagation,
  Transactional,
  WrapInTransactionOptions,
} from '../../vendor/transactional';

export interface DefTransactionOptions {
  connectionName?: string | (() => string | undefined);
  propagation?: Propagation;
  isoLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  isolationLevel?:
    | IsolationLevel
    | 'READ_UNCOMMITTED'
    | 'READ_COMMITTED'
    | 'REPEATABLE_READ'
    | 'SERIALIZABLE';
}

/**
 * Transactional decorator
 * @param options
 * @returns
 */
export function DefTransaction(options?: DefTransactionOptions): MethodDecorator {
  if (!options) {
    return Transactional();
  }
  const { connectionName, propagation, isoLevel } = options;
  let isolationLevel: IsolationLevel | undefined;
  const targetIso = options.isolationLevel ?? isoLevel;
  if (targetIso) {
    for (const [key, val] of Object.entries(IsolationLevel)) {
      if (targetIso === val || targetIso === key) {
        isolationLevel = val;
        break;
      }
    }
  }
  const mixOptions: WrapInTransactionOptions = {};
  if (connectionName !== undefined) {
    mixOptions.connectionName = connectionName;
  }
  if (propagation !== undefined) {
    mixOptions.propagation = propagation;
  }
  if (isolationLevel !== undefined) {
    mixOptions.isolationLevel = isolationLevel;
  }
  return Transactional(mixOptions);
}
