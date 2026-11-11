import "reflect-metadata";
import { PATH_METADATA, METHOD_METADATA, HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { HttpStatus, RequestMethod } from "@nestjs/common";
import {
  DefController,
  DefGet,
  DefPost,
  DefPut,
  DefPatch,
  DefDelete,
} from "../..";

describe("@DefController", () => {
  it("registers controller prefix metadata like @Controller", () => {
    @DefController("users")
    class UsersController {}
    expect(Reflect.getMetadata(PATH_METADATA, UsersController)).toBe("users");
  });

  it("accepts ControllerOptions object", () => {
    @DefController({ path: "books", version: "1" })
    class BooksController {}
    expect(Reflect.getMetadata(PATH_METADATA, BooksController)).toBe("books");
  });
  it("accepts no arguments and defaults path to /", () => {
    @DefController()
    class RootController {}
    expect(Reflect.getMetadata(PATH_METADATA, RootController)).toBe("/");
  });
});

describe("HTTP method decorators", () => {
  class Foo {
    @DefGet("list")
    list() {}
    @DefPost("create")
    create() {}
    @DefPut("update")
    update() {}
    @DefPatch("patch")
    patch() {}
    @DefDelete("remove")
    remove() {}
    @DefPost("create-created", { statusCode: HttpStatus.CREATED })
    createCreated() {}
  }

  const proto = Foo.prototype;

  it("DefGet maps to GET with correct path", () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.list)).toBe("list");
    expect(Reflect.getMetadata(METHOD_METADATA, proto.list)).toBe(
      RequestMethod.GET
    );
  });

  it("DefPost maps to POST", () => {
    expect(Reflect.getMetadata(METHOD_METADATA, proto.create)).toBe(
      RequestMethod.POST
    );
  });

  it("DefPut maps to PUT", () => {
    expect(Reflect.getMetadata(METHOD_METADATA, proto.update)).toBe(
      RequestMethod.PUT
    );
  });

  it("DefPatch maps to PATCH", () => {
    expect(Reflect.getMetadata(METHOD_METADATA, proto.patch)).toBe(
      RequestMethod.PATCH
    );
  });

  it("DefDelete maps to DELETE", () => {
    expect(Reflect.getMetadata(METHOD_METADATA, proto.remove)).toBe(
      RequestMethod.DELETE
    );
  });
  it("DefPost sets custom HTTP status code", () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.createCreated)).toBe(
      HttpStatus.CREATED
    );
  });
});

describe("Swagger metadata", () => {
  const API_OPERATION = "swagger/apiOperation";
  const API_RESPONSE = "swagger/apiResponse";
  const API_PARAMETERS = "swagger/apiParameters";
  const API_SECURITY = "swagger/apiSecurity";

  class BodyDto {}
  class ResultDto {}

  class Endpoints {
    @DefGet()
    plainGet() {}
    @DefGet(["a", "b"], { summary: "list", responseType: [ResultDto], statusCode: HttpStatus.ACCEPTED })
    typedGet() {}
    @DefGet("nullish", null as never)
    nullishGet() {}
    @DefPost("post", { summary: "create", bodyType: BodyDto, responseType: ResultDto })
    typedPost() {}
    @DefPut("put", { bodyType: BodyDto })
    typedPut() {}
    @DefPatch("patch", { bodyType: BodyDto })
    typedPatch() {}
    @DefDelete("delete", { bodyType: BodyDto })
    typedDelete() {}
    @DefPost()
    plainPost() {}
    @DefPut("nullish", null as never)
    nullishPut() {}
  }
  const proto = Endpoints.prototype;
  const bodyOf = (method: Function) =>
    (Reflect.getMetadata(API_PARAMETERS, method) ?? []).find((p: { in: string }) => p.in === "body");

  it("@DefController adds bearer auth", () => {
    @DefController("secure")
    class SecureController {}
    expect(Reflect.getMetadata(API_SECURITY, SecureController)).toEqual([{ bearer: [] }]);
  });

  it("@DefController accepts an array of prefixes", () => {
    @DefController(["v1", "v2"])
    class MultiController {}
    expect(Reflect.getMetadata(PATH_METADATA, MultiController)).toEqual(["v1", "v2"]);
  });

  it("defaults to 200, an empty summary and an untyped response", () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.plainGet)).toBe("/");
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.plainGet)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(API_OPERATION, proto.plainGet)).toMatchObject({ summary: "" });
    expect(Reflect.getMetadata(API_RESPONSE, proto.plainGet)[HttpStatus.OK].type).toBeUndefined();
    expect(bodyOf(proto.plainPost)).toBeUndefined();
  });

  it("treats null options like the defaults", () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.nullishGet)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.nullishPut)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(METHOD_METADATA, proto.nullishPut)).toBe(RequestMethod.PUT);
  });

  it("DefGet applies summary, status, array paths and response type", () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.typedGet)).toEqual(["a", "b"]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.typedGet)).toBe(HttpStatus.ACCEPTED);
    expect(Reflect.getMetadata(API_OPERATION, proto.typedGet)).toMatchObject({ summary: "list" });
    expect(Reflect.getMetadata(API_RESPONSE, proto.typedGet)[HttpStatus.ACCEPTED])
      .toMatchObject({ type: ResultDto, isArray: true });
  });

  it("DefPost applies summary, response type and body type", () => {
    expect(Reflect.getMetadata(API_OPERATION, proto.typedPost)).toMatchObject({ summary: "create" });
    expect(Reflect.getMetadata(API_RESPONSE, proto.typedPost)[HttpStatus.OK].type).toBe(ResultDto);
    expect(bodyOf(proto.typedPost)).toMatchObject({ type: BodyDto });
  });

  it.each(["typedPut", "typedPatch", "typedDelete"] as const)("%s documents its body type", (method) => {
    expect(bodyOf(proto[method])).toMatchObject({ type: BodyDto });
  });
});
