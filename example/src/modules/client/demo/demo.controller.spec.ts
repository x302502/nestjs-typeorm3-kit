import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

describe('client/DemoController', () => {
  let controller: DemoController;
  const demoService = {
    getData: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [DemoController],
      providers: [{ provide: DemoService, useValue: demoService }],
    }).compile();
    controller = moduleRef.get(DemoController);
  });

  it('GET list -> service.getData(params)', async () => {
    const params = { q: 'x' } as any;
    demoService.getData.mockResolvedValue(['a']);
    await expect(controller.getData(params)).resolves.toEqual(['a']);
    expect(demoService.getData).toHaveBeenCalledWith(params);
  });

  it('POST list -> service.create(body)', async () => {
    const body = { name: 'n' };
    demoService.create.mockResolvedValue({ id: 1 });
    await expect(controller.create(body)).resolves.toEqual({ id: 1 });
    expect(demoService.create).toHaveBeenCalledWith(body);
  });
});
