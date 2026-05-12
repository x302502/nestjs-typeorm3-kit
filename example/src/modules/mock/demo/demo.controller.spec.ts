import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

describe('mock/DemoController', () => {
  let controller: DemoController;
  const demoService = { getData: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [DemoController],
      providers: [{ provide: DemoService, useValue: demoService }],
    }).compile();
    controller = moduleRef.get(DemoController);
  });

  it('GET list -> service.getData(params)', async () => {
    const params = { foo: 'bar' } as any;
    demoService.getData.mockResolvedValue({ moduleName: 'Demo', data: params });
    await expect(controller.getData(params)).resolves.toEqual({
      moduleName: 'Demo',
      data: params,
    });
    expect(demoService.getData).toHaveBeenCalledWith(params);
  });
});
