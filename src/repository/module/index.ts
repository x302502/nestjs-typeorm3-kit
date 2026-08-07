import { DynamicModule, ModuleMetadata, Provider, Type } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
import type { DataSource, DataSourceOptions } from "typeorm";

import { getEntityByRepository, getDefRepositoryToken } from "../config/utils";
import type { Repository } from "../config/types";
import FastGlob from "fast-glob";
import {
  DEF_REPOSITORY_OPTIONS,
  ENTITY_METADATA_KEY,
} from "../config/constants";

export interface DefRepositoryModuleOptions {
  globPattern: string;
  dataSource?: string | DataSource | DataSourceOptions;
}

export interface DefRepositoryOptionsFactory {
  createDefRepositoryOptions():
    | Promise<DefRepositoryModuleOptions>
    | DefRepositoryModuleOptions;
}

export interface DefRepositoryModuleAsyncOptions
  extends Pick<ModuleMetadata, "imports"> {
  useFactory?: (
    ...args: any[]
  ) => Promise<DefRepositoryModuleOptions> | DefRepositoryModuleOptions;
  useClass?: Type<DefRepositoryOptionsFactory>;
  useExisting?: Type<DefRepositoryOptionsFactory>;
  inject?: any[];
}

function getProviders(
  repositories: Repository[],
  dataSource?: string | DataSource | DataSourceOptions
): Provider[] {
  return repositories.map((repository) => {
    const entity = getEntityByRepository(repository);
    return {
      provide: getDefRepositoryToken(repository, dataSource),
      useFactory: (dataSource: DataSource) => {
        return new repository(entity, dataSource.manager);
      },
      inject: [getDataSourceToken(dataSource)],
    };
  });
}

export class DefRepositoryModule {
  /**
   * Manual registration for feature modules
   */
  static forFeature(
    repositories: Repository[],
    dataSource?: string | DataSource | DataSourceOptions
  ): DynamicModule {
    const providers = getProviders(repositories, dataSource);
    return { module: DefRepositoryModule, providers, exports: providers };
  }

  /**
   * Root async registration using glob pattern
   */
  static async forRoot(
    options: DefRepositoryModuleOptions
  ): Promise<DynamicModule> {
    const repositories = await DefRepositoryModule.loadRepositories(
      options.globPattern
    );
    const providers = getProviders(repositories, options.dataSource);
    return { module: DefRepositoryModule, providers, exports: providers };
  }

  /**
   * Asynchronous DI-based registration
   */
  static async forRootAsync(
    options: DefRepositoryModuleAsyncOptions
  ): Promise<DynamicModule> {
    // Step 1: Resolve options
    const asyncProviders = DefRepositoryModule.createAsyncProviders(options);

    // NestJS không khởi tạo providers nếu chưa tạo app, nên bạn cần resolve tay `useFactory` tại đây
    const opts = await DefRepositoryModule.resolveOptions(options);

    // Step 2: Load repo classes matching @DefEntityRepository
    const repositories = await DefRepositoryModule.loadRepositories(
      opts.globPattern
    );

    // Step 3: Create repo providers
    const providers = getProviders(repositories, opts.dataSource);

    return {
      module: DefRepositoryModule,
      imports: options.imports || [],
      providers: [...asyncProviders, ...providers],
      exports: [...providers],
    };
  }

  private static createAsyncProviders(
    options: DefRepositoryModuleAsyncOptions
  ): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: DEF_REPOSITORY_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
      ];
    }

    const injectClass = options.useClass || options.useExisting;
    if (!injectClass) {
      throw new Error(
        "Invalid async configuration. Must provide useFactory, useClass, or useExisting."
      );
    }

    const providers: Provider[] = [
      {
        provide: DEF_REPOSITORY_OPTIONS,
        useFactory: async (factory: DefRepositoryOptionsFactory) =>
          factory.createDefRepositoryOptions(),
        inject: [injectClass],
      },
    ];

    if (options.useClass) {
      providers.push({ provide: injectClass, useClass: injectClass });
    }

    return providers;
  }
  private static async resolveOptions(
    options: DefRepositoryModuleAsyncOptions
  ): Promise<DefRepositoryModuleOptions> {
    if (options.useFactory) {
      return await options.useFactory(...(options.inject || []));
    }

    const injectClass = options.useClass || options.useExisting;
    if (!injectClass) {
      throw new Error(
        "Missing configuration provider (useClass, useExisting or useFactory)."
      );
    }

    const instance: DefRepositoryOptionsFactory = new injectClass();
    return await instance.createDefRepositoryOptions();
  }
  private static async loadRepositories(globPattern: string) {
    // fix globPattern windows path
    globPattern = globPattern.replace(/\\/g, "/");
    const files = await FastGlob(globPattern, { absolute: true });
    const repositories: any[] = [];
    for (const file of files) {
      const moduleExports = await import(file);
      for (const exported of Object.values(moduleExports)) {
        if (typeof exported === "function") {
          const hasEntityMeta = Reflect.hasMetadata(
            ENTITY_METADATA_KEY,
            exported
          );
          if (hasEntityMeta) {
            repositories.push(exported);
          }
        }
      }
    }
    return repositories;
  }
}
