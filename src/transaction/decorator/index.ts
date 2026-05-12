import { IsolationLevel, Propagation, Transactional } from '../../vendor/transactional';

/**
 * Transactional decorator
 * @param options
 * @returns
 */
export function DefTransaction(options?: {
  connectionName?: string | (() => string | undefined);
  propagation?: Propagation;
  isoLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
}): MethodDecorator {
  if (!options) {
    return function <T>(
      target: Object,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<T>,
    ) {
      return Transactional({
        //  propagation: Propagation.NESTED,
      })(target, propertyKey, descriptor);
    };
  }
  const { connectionName = undefined, propagation = undefined, isoLevel = undefined } = options;
  let isolationLevel: IsolationLevel = undefined;
  Object.keys(IsolationLevel).forEach(key => {
    if (isoLevel === key) {
      isolationLevel = IsolationLevel[key];
    }
  });
  const mixOptions = {};
  if (connectionName) {
    Object.assign(mixOptions, { connectionName });
  }
  if (propagation) {
    Object.assign(mixOptions, { propagation });
  }
  if (isoLevel) {
    Object.assign(mixOptions, { isoLevel });
  }
  return function <T>(
    target: Object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ) {
    return Transactional(mixOptions)(target, propertyKey, descriptor);
  };
}
