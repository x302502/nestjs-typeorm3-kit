/**
 * Test helper: replaces `DefTransaction` from `nestjs-typeorm3-kit` with a
 * no-op passthrough so that services decorated with `@DefTransaction` can be
 * unit-tested without a real DataSource or initialised transactional context.
 *
 * Usage: at the top of a *.spec.ts file (before any other imports of the
 * service-under-test), add:
 *
 *   jest.mock('nestjs-typeorm3-kit', () =>
 *     require('~/__tests__/mock-transactional').mockTransactional(),
 *   );
 */
export function mockTransactional() {
  const actual = jest.requireActual('nestjs-typeorm3-kit');
  return {
    ...actual,
    DefTransaction:
      () =>
      (
        _target: object,
        _propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
      ) =>
        descriptor,
  };
}
