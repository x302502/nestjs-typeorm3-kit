import 'reflect-metadata';
jest.mock('nestjs-typeorm3-kit', () =>
  require('~/__tests__/mock-transactional').mockTransactional(),
);
import { ExampleService } from './example.service';

describe('mock/ExampleService', () => {
  const service = new ExampleService();

  it('echoes back the params under "Example"', async () => {
    const params = { x: 1 } as any;
    await expect(service.getData(params)).resolves.toEqual({
      moduleName: 'Example',
      data: params,
    });
  });
});
