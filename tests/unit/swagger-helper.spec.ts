import "reflect-metadata";
import { SwaggerModule } from "@nestjs/swagger";
import { configSwaggerDocument } from "../../src";

jest.mock("class-validator-jsonschema", () => ({
  validationMetadatasToSchemas: jest.fn(),
}));

jest.mock("@nestjs/swagger", () => {
  const actual = jest.requireActual("@nestjs/swagger");
  return {
    ...actual,
    SwaggerModule: { setup: jest.fn() },
  };
});

import { validationMetadatasToSchemas } from "class-validator-jsonschema";

/**
 * Unit tests for configSwaggerDocument - specifically to prevent regression of
 * the `{ key: value }` bug (computed property name was missing), which caused
 * every generated schema to be merged under the literal key "key".
 */
describe("configSwaggerDocument", () => {
  const fakeApp: any = {};
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("merges schemas using the actual key name (regression for { key: value } bug)", () => {
    (validationMetadatasToSchemas as jest.Mock).mockReturnValue({
      UserDto: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      BookDto: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    });

    const document: any = {
      components: { schemas: {} },
    };

    configSwaggerDocument(fakeApp, document, "swagger");

    expect(document.components.schemas).toHaveProperty("UserDto");
    expect(document.components.schemas).toHaveProperty("BookDto");
    expect(document.components.schemas).not.toHaveProperty("key");
    expect(document.components.schemas.UserDto.properties.name.type).toBe(
      "string"
    );
  });

  it("merges new properties into an existing schema", () => {
    (validationMetadatasToSchemas as jest.Mock).mockReturnValue({
      UserDto: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    });

    const document: any = {
      components: {
        schemas: {
          UserDto: {
            type: "object",
            properties: { id: { type: "number" } },
            required: [],
          },
        },
      },
    };

    configSwaggerDocument(fakeApp, document, "swagger");

    expect(document.components.schemas.UserDto.properties).toEqual({
      id: { type: "number" },
      name: { type: "string" },
    });
    expect(document.components.schemas.UserDto.required).toEqual(["name"]);
  });

  it("calls SwaggerModule.setup with the given path", () => {
    (validationMetadatasToSchemas as jest.Mock).mockReturnValue({});
    const document: any = { components: { schemas: {} } };
    configSwaggerDocument(fakeApp, document, "docs");
    expect(SwaggerModule.setup).toHaveBeenCalledWith("docs", fakeApp, document);
  });

  it("uses default path 'swagger' when not provided", () => {
    (validationMetadatasToSchemas as jest.Mock).mockReturnValue({});
    const document: any = { components: { schemas: {} } };
    configSwaggerDocument(fakeApp, document);
    expect(SwaggerModule.setup).toHaveBeenCalledWith(
      "swagger",
      fakeApp,
      document
    );
  });
});
