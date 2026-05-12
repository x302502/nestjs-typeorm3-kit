import 'reflect-metadata';
jest.mock('nestjs-typeorm3-kit', () =>
  require('~/__tests__/mock-transactional').mockTransactional(),
);
import { Test } from '@nestjs/testing';
import { DemoService } from './demo.service';
import { BookRepo } from '~/domains/primary/book/book.repo';
import { PhotoRepo } from '~/domains/primary/photo/photo.repo';
import { ExampleRepo } from '~/domains/secondary/example/example.repo';
import { DataLogRepo } from '~/domains/secondary/data-log/data-log.repo';
import { getDefRepositoryToken } from 'nestjs-typeorm3-kit';
import { SECONDARY_CONNECTION } from '~/common/constants';

describe('client/DemoService', () => {
  let service: DemoService;
  const bookRepo = { find: jest.fn() };
  const photoRepo = {};
  const exampleRepo = { save: jest.fn() };
  const dataLogRepo = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: BookRepo, useValue: bookRepo },
        { provide: PhotoRepo, useValue: photoRepo },
        {
          provide: getDefRepositoryToken(ExampleRepo, SECONDARY_CONNECTION),
          useValue: exampleRepo,
        },
        {
          provide: getDefRepositoryToken(DataLogRepo, SECONDARY_CONNECTION),
          useValue: dataLogRepo,
        },
      ],
    }).compile();
    service = moduleRef.get(DemoService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
    expect(service.bookRepo).toBe(bookRepo);
    expect(service.exampleRepo).toBe(exampleRepo);
  });

  it('getData delegates to bookRepo.find with the given params', async () => {
    const params = { page: 1 } as any;
    const fixture = [{ id: 1, name: 'a' }];
    bookRepo.find.mockResolvedValue(fixture);

    const result = await service.getData(params);

    expect(bookRepo.find).toHaveBeenCalledWith(params);
    expect(result).toEqual(fixture);
  });

  it('create delegates to exampleRepo.save', async () => {
    const body = { name: 'new' };
    const saved = { id: 1, ...body };
    exampleRepo.save.mockResolvedValue(saved);

    const result = await service.create(body);

    expect(exampleRepo.save).toHaveBeenCalledWith(body);
    expect(result).toEqual(saved);
  });
});
