import "reflect-metadata";
import { DynamicModule, forwardRef, Injectable, Module, Type } from "@nestjs/common";
import { MODULE_PATH } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { ChildModule, DefController, DefGet } from "../..";

const API_TAGS = "swagger/apiUseTags";

const importsOf = (moduleType: Function) => Reflect.getMetadata("imports", moduleType) as unknown[];
const exportsOf = (moduleType: Function) => Reflect.getMetadata("exports", moduleType) as unknown[];
const pathOf = (moduleType: unknown) => Reflect.getMetadata(MODULE_PATH, moduleType as Function);
const routeController = () => {
  @DefController("route")
  class RouteController {}
  return RouteController;
};

describe("ChildModule metadata", () => {
  it("accepts no metadata and registers an empty path", () => {
    @ChildModule()
    class EmptyModule {}
    expect(pathOf(EmptyModule)).toBe("");
    expect(importsOf(EmptyModule)).toBeUndefined();
  });

  it("copies standard module metadata and normalizes the prefix", () => {
    class Service {}
    @ChildModule({ prefix: "/admin/", providers: [Service], exports: [Service] })
    class AdminModule {}
    expect(pathOf(AdminModule)).toBe("/admin");
    expect(Reflect.getMetadata("providers", AdminModule)).toEqual([Service]);
    expect(exportsOf(AdminModule)).toEqual([Service]);
  });

  it("rejects unknown module keys", () => {
    expect(() => ChildModule({ unknown: [] } as never)).toThrow(/unknown/);
  });

  it("tags controllers by prefix in PascalCase, or with [API] without a prefix", () => {
    @DefController("a")
    class AController {}
    @DefController("b")
    class BController {}

    @ChildModule({ prefix: "admin-user_settings", controllers: [AController, undefined as never] })
    class TaggedModule {}
    @ChildModule({ controllers: [BController] })
    class UntaggedModule {}

    expect(Reflect.getMetadata(API_TAGS, AController)).toEqual(["[AdminUserSettings] AController"]);
    expect(Reflect.getMetadata(API_TAGS, BController)).toEqual(["[API]BController"]);
    expect(pathOf(TaggedModule)).toBe("/admin-user_settings");
    expect(pathOf(UntaggedModule)).toBe("");
  });

  it("leaves imports untouched when there is no prefix", () => {
    @Module({})
    class Leaf {}
    const dynamic: DynamicModule = { module: Leaf };
    @ChildModule({ imports: [Leaf, dynamic] })
    class Root {}
    expect(importsOf(Root)).toEqual([Leaf, dynamic]);
  });

  it("scopes imported modules under the prefix and reuses one copy per path", () => {
    @ChildModule({ prefix: "leaf", controllers: [routeController()] })
    class Leaf {}
    const dynamic: DynamicModule = { module: Leaf, providers: [] };

    @ChildModule({ prefix: "api", imports: [Leaf, dynamic] })
    class First {}
    @ChildModule({ prefix: "api", imports: [Leaf, dynamic] })
    class Second {}
    @ChildModule({ prefix: "other", imports: [Leaf] })
    class Third {}

    const [scopedLeaf, scopedDynamic] = importsOf(First) as [Type<object>, DynamicModule];
    expect(scopedLeaf).not.toBe(Leaf);
    expect(scopedLeaf.name).toBe("Leaf");
    expect(new scopedLeaf()).toBeInstanceOf(Leaf);
    expect(pathOf(scopedLeaf)).toBe("/api/leaf");
    expect(pathOf(Leaf)).toBe("/leaf");

    expect(scopedDynamic).not.toBe(dynamic);
    expect(scopedDynamic.module).toBe(scopedLeaf);
    expect(scopedDynamic.providers).toBe(dynamic.providers);

    expect(importsOf(Second)).toEqual([scopedLeaf, scopedDynamic]);
    expect(importsOf(Second)[1]).toBe(scopedDynamic);
    expect(pathOf(importsOf(Third)[0])).toBe("/other/leaf");
  });

  it("keeps route-less modules shared instead of scoping them", () => {
    @Module({})
    class Shared {}
    const dynamic: DynamicModule = { module: Shared, providers: [] };
    @Module({ imports: [Shared] })
    class Wrapper {}

    @ChildModule({ prefix: "api", imports: [Shared, dynamic, Wrapper], exports: [Shared] })
    class Parent {}

    expect(importsOf(Parent)).toEqual([Shared, dynamic, Wrapper]);
    expect(importsOf(Parent)[1]).toBe(dynamic);
    expect(exportsOf(Parent)).toEqual([Shared]);
  });

  it("rewrites exports of imported modules to their scoped copies", () => {
    @Module({ controllers: [routeController()] })
    class ClassModule {}
    @Module({ controllers: [routeController()] })
    class DynamicTarget {}
    @Module({})
    class NotImported {}
    const dynamic: DynamicModule = { module: DynamicTarget };
    const strayDynamic: DynamicModule = { module: NotImported };

    @ChildModule({
      prefix: "x",
      imports: [ClassModule, dynamic],
      exports: [ClassModule, dynamic, NotImported, strayDynamic, "TOKEN"],
    })
    class Parent {}

    const [scopedClass, scopedDynamic] = importsOf(Parent) as [Type<object>, DynamicModule];
    expect(exportsOf(Parent)).toEqual([
      scopedClass,
      scopedDynamic.module,
      NotImported,
      strayDynamic,
      "TOKEN",
    ]);
  });

  it("resolves forward-referenced exports lazily", () => {
    @Module({ controllers: [routeController()] })
    class Lazy {}
    @Module({})
    class Unrelated {}

    @ChildModule({
      prefix: "fw",
      imports: [forwardRef(() => Lazy)],
      exports: [forwardRef(() => Lazy), Lazy, Unrelated],
    })
    class Parent {}

    const [forwardImport] = importsOf(Parent) as [{ forwardRef: () => Type<object> }];
    const scopedLazy = forwardImport.forwardRef();
    expect(pathOf(scopedLazy)).toBe("/fw");

    const [forwardExport, classExport, unrelatedExport] =
      exportsOf(Parent) as Array<{ forwardRef: () => unknown }>;
    expect(forwardExport.forwardRef()).toBe(scopedLazy);
    expect(classExport.forwardRef()).toBe(scopedLazy);
    expect(unrelatedExport.forwardRef()).toBe(Unrelated);
  });
});

describe("ChildModule in a running app", () => {
  it("re-exports a dynamic module's providers under a prefix", async () => {
    @Injectable()
    class Clock {
      now = "noon";
    }
    @Module({})
    class ClockModule {}
    const clockModule: DynamicModule = { module: ClockModule, providers: [Clock], exports: [Clock] };

    @ChildModule({ prefix: "time", imports: [clockModule], exports: [clockModule] })
    class TimeModule {}

    @DefController("clock")
    class ClockController {
      constructor(private readonly clock: Clock) {}
      @DefGet()
      get() {
        return { now: this.clock.now };
      }
    }
    @ChildModule({ prefix: "api", imports: [TimeModule], controllers: [ClockController] })
    class ApiModule {}

    @Module({ imports: [ApiModule] })
    class AppModule {}

    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/api/clock`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ now: "noon" });
    } finally {
      await app.close();
    }
  });
});
