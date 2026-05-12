import { wrapInTransaction, WrapInTransactionOptions } from '../transactions/wrap-in-transaction';

export const Transactional = (options?: WrapInTransactionOptions): MethodDecorator => {
  return ((
    _: unknown,
    methodName: string | symbol,
    descriptor: TypedPropertyDescriptor<unknown>,
  ) => {
    const originalMethod = descriptor.value as () => unknown;

    descriptor.value = wrapInTransaction(originalMethod, { ...options, name: methodName });

    Reflect.getMetadataKeys(originalMethod).forEach((previousMetadataKey) => {
      const previousMetadata = Reflect.getMetadata(previousMetadataKey, originalMethod);

      Reflect.defineMetadata(previousMetadataKey, previousMetadata, descriptor.value as object);
    });

    Object.defineProperty(descriptor.value, 'name', {
      value: originalMethod.name,
      writable: false,
    });
  }) as MethodDecorator;
};
