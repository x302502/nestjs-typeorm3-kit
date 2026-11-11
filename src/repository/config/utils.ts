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
    return `${connectionPrefix}${repository.name}`;
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

function getDataSourcePrefix(
  dataSource: string | DataSource | DataSourceOptions = DEFAULT_CONNECTION_NAME,
): string {
  if (!dataSource || dataSource === DEFAULT_CONNECTION_NAME) {
    return '';
  }
  if (typeof dataSource === 'string') {
    return dataSource + '_';
  }
  const name = 'name' in dataSource ? dataSource.name : undefined;
  if (!name || name === DEFAULT_CONNECTION_NAME) {
    return '';
  }
  return name + '_';
}

export async function loadRepositoriesFromPath(pattern: string): Promise<Repository[]> {
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const files = await FastGlob(normalizedPattern, { absolute: true });
  const repositorySet = new Set<Repository>();

  for (const file of files) {
    // Dynamic import required for runtime-discovered glob paths
    const moduleExports = (await import(file)) as Record<string, unknown>;
    for (const value of Object.values(moduleExports)) {
      if (typeof value === 'function' && Reflect.hasMetadata(ENTITY_METADATA_KEY, value)) {
        repositorySet.add(value as unknown as Repository);
      }
    }
  }

  return Array.from(repositorySet);
}
