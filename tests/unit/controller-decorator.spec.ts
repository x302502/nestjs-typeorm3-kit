import "reflect-metadata";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import {
  DefController,
  DefGet,
  DefPost,
  DefPut,
  DefPatch,
  DefDelete,
} from "../../src";

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
});
