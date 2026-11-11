import "reflect-metadata";
import { Body, Controller, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ApiProperty, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import { IsString, ValidateNested, useContainer } from "class-validator";
import { configSwaggerDocument } from ".";

class ChildDto {
  @IsString()
  name!: string;
}

class ParentDto {
  @ApiProperty({ description: "swagger-owned title" })
  @IsString()
  title!: string;

  @ValidateNested()
  @Reflect.metadata("design:type", ChildDto)
  child!: ChildDto;
}

@Controller("things")
class ThingsController {
  @Post()
  create(@Body() body: ParentDto) {
    return body;
  }
}

@Module({ controllers: [ThingsController] })
class AppModule {}

type Schema = {
  description?: string;
  $ref?: string;
  properties?: Record<string, { description?: string; $ref?: string }>;
  required?: string[];
};
type Doc = {
  components: { schemas: Record<string, Schema> };
  definitions?: unknown;
};

const fetchDocument = async (
  useNestContainer: boolean,
  prepare?: (document: OpenAPIObject) => void
): Promise<Doc> => {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    if (useNestContainer) {
      // Nest container without a MetadataStorage provider
      useContainer(app.select(AppModule), { fallbackOnErrors: false });
    }
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("t").build()
    );
    prepare?.(document);
    configSwaggerDocument(app, document, "docs");
    await app.listen(0, "127.0.0.1");
    const res = await fetch(`${await app.getUrl()}/docs-json`);
    expect(res.status).toBe(200);
    return (await res.json()) as Doc;
  } finally {
    await app.close();
    // restore class-validator's default container
    useContainer(undefined as never);
  }
};

describe("configSwaggerDocument", () => {
  it("references nested DTOs through #/components/schemas", async () => {
    const doc = await fetchDocument(false);

    expect(doc.components.schemas.ChildDto.properties?.name).toBeDefined();
    expect(doc.components.schemas.ParentDto.properties?.child?.$ref).toBe(
      "#/components/schemas/ChildDto"
    );
    expect(JSON.stringify(doc)).not.toContain("#/definitions/");
  });

  it("does not overwrite Swagger-generated properties", async () => {
    const doc = await fetchDocument(false);

    const title = doc.components.schemas.ParentDto.properties?.title;
    expect(title?.description).toBe("swagger-owned title");
    expect(doc.components.schemas.ParentDto.required).toEqual(
      expect.arrayContaining(["title", "child"])
    );
  });

  it("keeps a Swagger-owned schema reference intact", async () => {
    const doc = await fetchDocument(false, document => {
      document.components.schemas!.ParentDto = {
        $ref: "#/components/schemas/ChildDto",
      };
    });
    expect(doc.components.schemas.ParentDto).toEqual({
      $ref: "#/components/schemas/ChildDto",
    });
  });

  it("works when class-validator uses the Nest container without a MetadataStorage provider", async () => {
    const doc = await fetchDocument(true);

    expect(doc.components.schemas.ParentDto.properties?.child?.$ref).toBe(
      "#/components/schemas/ChildDto"
    );
    expect(doc.components.schemas.ChildDto.properties?.name).toBeDefined();
  });
});
