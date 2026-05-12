import "reflect-metadata";
import { MODULE_PATH } from "@nestjs/common/constants";
import { ChildModule } from "../../src";

class DummyController {}

describe("ChildModule decorator", () => {
  it("sets MODULE_PATH based on the prefix, normalised with a leading slash", () => {
    @ChildModule({ prefix: "client", controllers: [DummyController] })
    class ClientModule {}
    expect(Reflect.getMetadata(MODULE_PATH, ClientModule)).toBe("/client");
  });

  it("normalises prefixes with extra slashes", () => {
    @ChildModule({ prefix: "//api/v1//", controllers: [] })
    class ApiModule {}
    expect(Reflect.getMetadata(MODULE_PATH, ApiModule)).toBe("/api/v1");
  });

  it("sets empty MODULE_PATH for empty prefix", () => {
    @ChildModule({ prefix: "", controllers: [] })
    class RootModule {}
    expect(Reflect.getMetadata(MODULE_PATH, RootModule)).toBe("");
  });

  it("forwards standard module metadata (controllers, providers, imports)", () => {
    class SvcA {}
    class CtrA {}
    @ChildModule({
      prefix: "x",
      controllers: [CtrA],
      providers: [SvcA],
      imports: [],
    })
    class MyModule {}

    expect(Reflect.getMetadata("controllers", MyModule)).toEqual([CtrA]);
    expect(Reflect.getMetadata("providers", MyModule)).toEqual([SvcA]);
  });

  it("propagates composed MODULE_PATH onto imported child modules", () => {
    @ChildModule({ prefix: "inner", controllers: [] })
    class InnerModule {}

    @ChildModule({ prefix: "outer", imports: [InnerModule], controllers: [] })
    class OuterModule {}
    void OuterModule;

    expect(Reflect.getMetadata(MODULE_PATH, InnerModule)).toBe("/outer/inner");
  });
});
