import {
  EntityManager,
  EntityMetadata,
  EntityNotFoundError,
  EntityTarget,
  FindOperator,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  QueryRunner,
  Repository as TypeOrmRepository,
} from "typeorm";

export interface Repository extends Function {
  // any: repositories narrow `target` to their own entity, which strictFunctionTypes
  // would otherwise reject
  new (
    target: EntityTarget<any>,
    manager: EntityManager,
    queryRunner?: QueryRunner
  ): TypeOrmRepository<any>;
}

/** Filter values TypeORM drops from `where` instead of matching or throwing. */
interface DroppedValues {
  undefined: boolean;
  null: boolean;
}

// `invalidWhereValuesBehavior` exists from TypeORM 0.3.27; both default to "ignore".
function droppedValues(manager: EntityManager | undefined): DroppedValues {
  const options = manager?.connection?.options as
    | { invalidWhereValuesBehavior?: { undefined?: string; null?: string } }
    | undefined;
  const behavior = options?.invalidWhereValuesBehavior;
  return {
    undefined: (behavior?.undefined ?? "ignore") === "ignore",
    null: (behavior?.null ?? "ignore") === "ignore",
  };
}

/**
 * True when `condition` has no effective predicate: not an object, empty, or a mapped
 * column / relation / embedded set to a value TypeORM silently drops.
 */
function isUnsafe(
  condition: unknown,
  metadata: EntityMetadata,
  dropped: DroppedValues,
  prefix = ""
): boolean {
  if (!condition || typeof condition !== "object") {
    return true;
  }
  if (Array.isArray(condition)) {
    return condition.length === 0 || condition.some(item => isUnsafe(item, metadata, dropped, prefix));
  }

  const keys = Object.keys(condition);
  if (keys.length === 0) {
    return true;
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const column = metadata.columns.some(col => (col.propertyPath || col.propertyName) === path);
    const relation = metadata.relations?.find(rel => rel.propertyPath === path);
    const embedded = metadata.embeddeds?.find(embed => embed.propertyPath === path);
    if (!column && !relation && !embedded) {
      continue;
    }

    const value = (condition as Record<string, unknown>)[key];
    if ((value === undefined && dropped.undefined) || (value === null && dropped.null)) {
      return true;
    }
    if (
      (relation || embedded) &&
      value !== null &&
      typeof value === "object" &&
      !(value instanceof FindOperator) &&
      isUnsafe(value, relation ? relation.inverseEntityMetadata : metadata, dropped, embedded ? path : "")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Single-row lookups return `null` (or throw `EntityNotFoundError` for the *OrFail
 * variants) instead of TypeORM's first row when the filter has no effective predicate.
 */
export class RepositoryWrapper<Entity extends ObjectLiteral> extends TypeOrmRepository<Entity> {
  override async findOne(
    options?: FindOneOptions<Entity>
  ): Promise<Entity | null> {
    if (isUnsafe(options?.where, this.metadata, droppedValues(this.manager))) {
      return null;
    }
    return super.findOne(options);
  }

  override async findOneBy(
    where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[]
  ): Promise<Entity | null> {
    if (isUnsafe(where, this.metadata, droppedValues(this.manager))) {
      return null;
    }
    return super.findOneBy(where);
  }

  // TypeORM's *OrFail methods call the manager directly, bypassing the guards above.
  override async findOneOrFail(options: FindOneOptions<Entity>): Promise<Entity> {
    const entity = await this.findOne(options);
    if (!entity) {
      throw new EntityNotFoundError(this.metadata.target, options);
    }
    return entity;
  }

  override async findOneByOrFail(
    where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[]
  ): Promise<Entity> {
    const entity = await this.findOneBy(where);
    if (!entity) {
      throw new EntityNotFoundError(this.metadata.target, where);
    }
    return entity;
  }
}
