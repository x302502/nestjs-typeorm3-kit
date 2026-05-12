import 'reflect-metadata';
jest.mock('nestjs-typeorm3-kit', () =>
  require('~/__tests__/mock-transactional').mockTransactional(),
);
import { DemoService } from './demo.service';

describe('mock/DemoService', () => {
  const service = new DemoService();

  it('echoes back the params under "Demo"', async () => {
    const params = { a: 1 } as any;
    await expect(service.getData(params)).resolves.toEqual({
      moduleName: 'Demo',
      data: params,
    });
  });
});
