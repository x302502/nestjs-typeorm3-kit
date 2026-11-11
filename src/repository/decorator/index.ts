import { Inject } from '@nestjs/common';
import type { DataSource, DataSourceOptions, EntityTarget, ObjectLiteral } from 'typeorm';
import { DEFAULT_CONNECTION_NAME, ENTITY_METADATA_KEY } from '../config/constants';
import type { Repository } from '../config/types';
import { getDefRepositoryToken } from '../config/utils';

export function DefEntityRepository(target: EntityTarget<ObjectLiteral>) {
  // any[]: a subclass constructor typed for its own entity must still be accepted
  return function (constructor: { new (...args: any[]): unknown }) {
    Reflect.defineMetadata(ENTITY_METADATA_KEY, target, constructor);
  };
}

export function InjectRepo(
  repository: Repository,
  dataSource: string | DataSource | DataSourceOptions = DEFAULT_CONNECTION_NAME,
) {
  return Inject(getDefRepositoryToken(repository, dataSource));
}
