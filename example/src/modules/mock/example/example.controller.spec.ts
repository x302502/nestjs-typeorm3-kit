import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

describe('mock/ExampleController', () => {
  let controller: ExampleController;
  const exampleService = { getData: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ExampleController],
      providers: [{ provide: ExampleService, useValue: exampleService }],
    }).compile();
    controller = moduleRef.get(ExampleController);
  });

  it('GET / -> service.getData(params)', async () => {
    const params = { q: 'hello' } as any;
    exampleService.getData.mockResolvedValue({ moduleName: 'Example', data: params });
    await expect(controller.getData(params)).resolves.toEqual({
      moduleName: 'Example',
      data: params,
    });
    expect(exampleService.getData).toHaveBeenCalledWith(params);
  });
});
