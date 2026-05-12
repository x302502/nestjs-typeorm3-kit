import { wrapInTransaction, WrapInTransactionOptions } from './wrap-in-transaction';

export const runInTransaction = <Func extends (this: unknown) => ReturnType<Func>>(
  fn: Func,
  options?: WrapInTransactionOptions,
) => {
  return wrapInTransaction(fn, options)();
};
