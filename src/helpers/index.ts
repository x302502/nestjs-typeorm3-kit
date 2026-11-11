import { INestApplication } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { SwaggerDocumentOptions } from "@nestjs/swagger";
import { getMetadataStorage } from "class-validator";
import {
  OpenAPIObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { validationMetadatasToSchemas } from "class-validator-jsonschema";

export const configSwaggerDocument = (
  app: INestApplication,
  document: OpenAPIObject,
  swaggerPath: string = "swagger"
) => {
  // Creating all the swagger schemas based on the class-validator decorators.
  // The global metadata storage is read directly so a user-configured
  // useContainer() without a MetadataStorage provider still works.
  document.components = document.components || {};
  const targetSchemas = document.components.schemas || {};
  const schemasBinding =
    validationMetadatasToSchemas({
      classValidatorMetadataStorage: getMetadataStorage(),
      refPointerPrefix: "#/components/schemas/",
    }) || {};

  Object.keys(schemasBinding).forEach((key) => {
    const value = schemasBinding[key] as SchemaObject;
    const targetValue = targetSchemas[key];
    if (!targetValue) {
      targetSchemas[key] = value;
      return;
    }
    if ("$ref" in targetValue) {
      return;
    }

    // Keep Swagger-generated properties; only fill in what it does not know.
    const properties = (targetValue.properties = targetValue.properties || {});
    Object.keys(value.properties || {}).forEach((prop) => {
      if (!(prop in properties)) properties[prop] = value.properties[prop];
    });
    const required = new Set<string>([
      ...(targetValue.required || []),
      ...(value.required || []),
    ]);
    if (required.size) targetValue.required = [...required];
  });
  document.components.schemas = Object.assign({}, targetSchemas);
  SwaggerModule.setup(swaggerPath, app, document);
};

/**
 * Swagger's `include` compares module classes by identity. A ChildModule mounted
 * under multiple prefixes has one scoped Nest module class per mount, so expand
 * each public class to its mounted copies before delegating to Swagger.
 */
export function createScopedSwaggerDocument(
  app: INestApplication,
  config: Omit<OpenAPIObject, "paths">,
  options?: SwaggerDocumentOptions
): OpenAPIObject {
  if (!options?.include?.length) {
    return SwaggerModule.createDocument(app, config, options);
  }

  const included = new Set<Function>(options.include);
  for (const module of app.get(ModulesContainer).values()) {
    const moduleType = module.metatype;
    if (typeof moduleType !== "function" || included.has(moduleType)) {
      continue;
    }
    let prototype = Object.getPrototypeOf(moduleType.prototype);
    while (prototype) {
      if (included.has(prototype.constructor)) {
        included.add(moduleType);
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
  }
  return SwaggerModule.createDocument(app, config, {
    ...options,
    include: [...included],
  });
}

import { join } from "path";
import { readdirSync, statSync } from "fs";
import { Type } from "@nestjs/common";

/**
 * Dynamically loads class exports from files in subdirectories that match specific suffixes
 * (e.g., `.controller`, `.service`), and optionally appends manually provided classes.
 *
 * This supports files named in kebab-case (e.g., `demo-controller.ts`, `abc-service.ts`).
 *
 * @param baseDir - The base directory to search in (usually `__dirname`)
 * @param suffixes - File suffixes to match (e.g., ['.controller', '.service'])
 * @param additionalClasses - Optional array of class references to include manually
 * @returns Array of class constructors (Type<any>) to be used in NestJS modules
 */
export const lazyLoadClasses = (
  baseDir: string,
  suffixes: string[],
  additionalClasses: Type<any>[] = []
): Type<any>[] => {
  const results: Type<any>[] = [...additionalClasses];

  const subDirs = readdirSync(baseDir);

  for (const sub of subDirs) {
    const subPath = join(baseDir, sub);
    if (!statSync(subPath).isDirectory()) continue;

    const files = readdirSync(subPath);

    for (const file of files) {
      // Support .ts and .js files in kebab-case like abc-controller.ts
      const isMatch = suffixes.some(
        (suffix) =>
          file.endsWith(`${suffix}.ts`) || file.endsWith(`${suffix}.js`)
      );

      if (!isMatch) continue;

      const fullPath = join(subPath, file);
      const filePathWithoutExt = fullPath
        .replace(/\.ts$/, "")
        .replace(/\.js$/, "");

      try {
        const module = require(filePathWithoutExt);
        const exportedClass = Object.values(module)[0] as Type<any>;
        results.push(exportedClass);
      } catch (error) {
        console.warn(`⚠️ Failed to load class from: ${fullPath}`, error);
      }
    }
  }

  return results;
};
