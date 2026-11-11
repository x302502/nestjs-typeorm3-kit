import {
  EntityManager,
  EntityTarget,
  FindOperator,
  FindOneOptions,
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

export class RepositoryWrapper<Entity extends ObjectLiteral> extends TypeOrmRepository<Entity> {
  override async findOne(
    options?: FindOneOptions<Entity>
  ): Promise<Entity | null> {
    const where = options?.where;
    if (!where || typeof where !== "object") {
      return null;
    }

    const isUnsafe = (condition: unknown, metadata: typeof this.metadata, prefix = ""): boolean => {
      if (!condition || typeof condition !== "object") {
        return true;
      }
      if (Array.isArray(condition)) {
        return condition.length === 0 || condition.some(item => isUnsafe(item, metadata, prefix));
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
        if (value === undefined) {
          return true;
        }
        if (
          (relation || embedded) &&
          value !== null &&
          typeof value === "object" &&
          !(value instanceof FindOperator) &&
          isUnsafe(value, relation ? relation.inverseEntityMetadata : metadata, embedded ? path : "")
        ) {
          return true;
        }
      }
      return false;
    };

    if (isUnsafe(where, this.metadata)) {
      return null;
    }

    return super.findOne(options);
  }
}
