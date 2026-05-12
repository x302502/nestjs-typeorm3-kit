import 'reflect-metadata';
jest.mock('nestjs-typeorm3-kit', () =>
  require('~/__tests__/mock-transactional').mockTransactional(),
);
import { ExampleService } from './example.service';

describe('client/ExampleService', () => {
  const service = new ExampleService();

  it('returns the module name plus the params as data', async () => {
    const params = { foo: 'bar' } as any;
    await expect(service.getData(params)).resolves.toEqual({
      moduleName: 'Example',
      data: params,
    });
  });
});
