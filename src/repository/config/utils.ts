import { DataSource, DataSourceOptions, Repository as TypeOrmRepository } from 'typeorm';

import { DEFAULT_CONNECTION_NAME, ENTITY_METADATA_KEY } from './constants';
import { Repository } from './types';
import FastGlob from 'fast-glob';

export function getDefRepositoryToken(
  repository: Repository,
  dataSource: string | DataSource | DataSourceOptions = DEFAULT_CONNECTION_NAME,
) {
  if (!repository) {
    throw new Error('repository is not empty');
  }
  const connectionPrefix = getDataSourcePrefix(dataSource);
  if (repository instanceof Function && repository.prototype instanceof TypeOrmRepository) {
    if (!connectionPrefix) {
      return repository;
    }
    return `${connectionPrefix}${getToken(repository)}`;
  }
  return `${connectionPrefix}${repository.name}Repository`;
}

export function getEntityByRepository(repository: Repository) {
  const entity = Reflect.getMetadata(ENTITY_METADATA_KEY, repository);
  if (!entity) {
    throw new Error(`Repository: ${repository.name} undetermined entity`);
  }

  return entity;
}

function getToken(repository: Repository) {
  return repository.name;
}

function getDataSourcePrefix(
  dataSource: string | DataSource | DataSourceOptions = DEFAULT_CONNECTION_NAME,
) {
  if (dataSource === DEFAULT_CONNECTION_NAME) {
    return '';
  }
  if (typeof dataSource === 'string') {
    return dataSource + '_';
  }
  if (dataSource.name === DEFAULT_CONNECTION_NAME || !dataSource.name) {
    return '';
  }
  return dataSource.name + '_';
}
export async function loadRepositoriesFromPath(pattern: string): Promise<any[]> {
  const files = await FastGlob(pattern, { absolute: true });
  const repositories: any[] = [];

  for (const file of files) {
    const moduleExports = await import(file);
    for (const value of Object.values(moduleExports)) {
      if (typeof value === 'function') {
        repositories.push(value);
      }
    }
  }

  return repositories;
}
