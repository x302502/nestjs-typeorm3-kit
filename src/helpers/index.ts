import { INestApplication } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";
import { getFromContainer, MetadataStorage } from "class-validator";
import {
  OpenAPIObject,
  SchemasObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { validationMetadatasToSchemas } from "class-validator-jsonschema";

export const configSwaggerDocument = (
  app: INestApplication,
  document: OpenAPIObject,
  swaggerPath: string = "swagger"
) => {
  // Creating all the swagger schemas based on the class-validator decorators
  const metadatas = (getFromContainer(MetadataStorage) as any)
    .validationMetadatas;
  const targetSchemas = document.components.schemas || {};
  const schemasBinding = validationMetadatasToSchemas(metadatas) || {};

  Object.keys(schemasBinding).forEach((key) => {
    const value = schemasBinding[key] as SchemasObject;
    if (!targetSchemas[key]) {
      Object.assign(targetSchemas, { [key]: value });
    } else {
      const targetValue = targetSchemas[key] as SchemasObject;

      Object.assign(targetValue.properties, value.properties);
      targetValue.required = value.required;
      Object.assign(targetSchemas, { [key]: targetValue });
    }
  });
  document.components.schemas = Object.assign({}, targetSchemas);
  SwaggerModule.setup(swaggerPath, app, document);
};

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
