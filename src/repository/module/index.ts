import { DynamicModule, ModuleMetadata, Provider, Type } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
import type { DataSource, DataSourceOptions } from "typeorm";

import {
  getEntityByRepository,
  getDefRepositoryToken,
  loadRepositoriesFromPath,
} from "../config/utils";
import type { Repository } from "../config/types";
import { DEF_REPOSITORY_OPTIONS } from "../config/constants";
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
  useFactory?: () => Promise<DefRepositoryModuleOptions> | DefRepositoryModuleOptions;
  useClass?: Type<DefRepositoryOptionsFactory>;
}
function getProviders(
  repositories: Repository[],
  dataSource?: string | DataSource | DataSourceOptions
): Provider[] {
  return repositories.map((repository) => {
    const entity = getEntityByRepository(repository);
    return {
      provide: getDefRepositoryToken(repository, dataSource),
      useFactory: (dataSourceInstance: DataSource) => {
        return new repository(
          entity,
          dataSourceInstance?.manager,
          dataSourceInstance?.manager?.queryRunner
        );
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
    repositories: Repository[] = [],
    dataSource?: string | DataSource | DataSourceOptions
  ): DynamicModule {
    const uniqueRepositories = Array.from(new Set(repositories));
    const providers = getProviders(uniqueRepositories, dataSource);
    return { module: DefRepositoryModule, providers, exports: providers };
  }

  /**
   * Root async registration using glob pattern
   */
  static async forRoot(
    options: DefRepositoryModuleOptions
  ): Promise<DynamicModule> {
    if (!options?.globPattern) {
      throw new Error("DefRepositoryModule.forRoot requires a valid globPattern.");
    }
    const repositories = await DefRepositoryModule.loadRepositories(
      options.globPattern
    );
    const providers = getProviders(repositories, options.dataSource);
    return { module: DefRepositoryModule, providers, exports: providers };
  }

  /**
   * Resolve discovery options before Nest bootstrap, without DI.
   */
  static async forRootAsync(
    options: DefRepositoryModuleAsyncOptions
  ): Promise<DynamicModule> {
    if (!options) {
      throw new Error("DefRepositoryModule.forRootAsync requires options.");
    }
    if ("inject" in options || "useExisting" in options) {
      throw new Error(
        "DefRepositoryModule.forRootAsync cannot inject Nest providers before Nest bootstraps. Use a dependency-free useFactory or useClass."
      );
    }
    const opts = await DefRepositoryModule.resolveOptions(options);
    if (!opts?.globPattern) {
      throw new Error(
        "DefRepositoryModule.forRootAsync requires a valid globPattern from options."
      );
    }

    const repositories = await DefRepositoryModule.loadRepositories(
      opts.globPattern
    );
    const providers = getProviders(repositories, opts.dataSource);

    return {
      module: DefRepositoryModule,
      imports: options.imports || [],
      providers: [{ provide: DEF_REPOSITORY_OPTIONS, useValue: opts }, ...providers],
      exports: [...providers],
    };
  }

  private static async resolveOptions(
    options: DefRepositoryModuleAsyncOptions
  ): Promise<DefRepositoryModuleOptions> {
    if (options.useFactory) {
      return await options.useFactory();
    }

    const injectClass = options.useClass;
    if (!injectClass) {
      throw new Error(
        "Missing configuration factory (useClass or useFactory)."
      );
    }

    const instance: DefRepositoryOptionsFactory = new injectClass();
    return await instance.createDefRepositoryOptions();
  }
  private static async loadRepositories(
    globPattern: string
  ): Promise<Repository[]> {
    return loadRepositoriesFromPath(globPattern);
  }
}
