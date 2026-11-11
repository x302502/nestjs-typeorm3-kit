import { jest } from "@jest/globals";
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder } from "@nestjs/swagger";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";
import { createScopedSwaggerDocument, lazyLoadClasses } from "..";

describe("lazyLoadClasses", () => {
  let baseDir: string;
  const globals = globalThis as { require?: NodeRequire };
  const originalRequire = globals.require;

  const write = (relativePath: string, content: string) => {
    const file = join(baseDir, relativePath);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  };
  const exportClass = (name: string) => `exports.${name} = class ${name} {};\n`;
  const namesOf = (classes: Function[]) => classes.map(c => c.name).sort();

  beforeAll(() => {
    // lazyLoadClasses relies on CommonJS `require`, which the ESM test runtime lacks.
    globals.require = createRequire(join(process.cwd(), "package.json"));
    baseDir = mkdtempSync(join(tmpdir(), "lazy-load-"));
    write("users/users.controller.js", exportClass("UsersController") + exportClass("Second"));
    write("users/users.service.js", exportClass("UsersService"));
    write("users/users.entity.js", exportClass("UsersEntity"));
    write("orders/order-list.controller.js", exportClass("OrderListController"));
    write("orders/readme.md", "not code");
    write("orders/nested/deep.controller.js", exportClass("DeepController"));
    write("root.controller.js", exportClass("RootController"));
    write("broken/broken.service.js", "throw new Error('cannot load');\n");
  });

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
    globals.require = originalRequire;
  });

  it("loads the first exported class of matching files in direct subdirectories", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(namesOf(lazyLoadClasses(baseDir, [".controller", ".service"]))).toEqual([
        "OrderListController",
        "UsersController",
        "UsersService",
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("warns and skips files that fail to load", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(namesOf(lazyLoadClasses(baseDir, [".service"]))).toEqual(["UsersService"]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(join("broken", "broken.service.js"));
    } finally {
      warn.mockRestore();
    }
  });

  it("prepends additional classes", () => {
    class Manual {}
    const result = lazyLoadClasses(baseDir, [".entity"], [Manual]);
    expect(result[0]).toBe(Manual);
    expect(namesOf(result)).toEqual(["Manual", "UsersEntity"]);
  });

  it("returns only additional classes when nothing matches", () => {
    class Manual {}
    expect(lazyLoadClasses(baseDir, [".gateway"], [Manual])).toEqual([Manual]);
    expect(lazyLoadClasses(baseDir, [])).toEqual([]);
  });

  it("throws when the base directory does not exist", () => {
    expect(() => lazyLoadClasses(join(baseDir, "missing"), [".controller"])).toThrow(/ENOENT/);
  });
});

describe("createScopedSwaggerDocument", () => {
  @Controller("cats")
  class CatsController {
    @Get()
    list() {
      return [];
    }
  }
  @Module({ controllers: [CatsController] })
  class CatsModule {}

  @Controller("dogs")
  class DogsController {
    @Get()
    list() {
      return [];
    }
  }
  @Module({ controllers: [DogsController] })
  class DogsModule {}

  @Module({ imports: [CatsModule, DogsModule] })
  class AppModule {}

  const config = new DocumentBuilder().setTitle("t").build();

  const withApp = async (fn: (app: Awaited<ReturnType<typeof NestFactory.create>>) => void) => {
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      await app.init();
      fn(app);
    } finally {
      await app.close();
    }
  };

  it("documents every route when no include filter is given", async () => {
    await withApp(app => {
      expect(Object.keys(createScopedSwaggerDocument(app, config).paths).sort())
        .toEqual(["/cats", "/dogs"]);
      expect(Object.keys(createScopedSwaggerDocument(app, config, { include: [] }).paths).sort())
        .toEqual(["/cats", "/dogs"]);
    });
  });

  it("limits the document to included modules", async () => {
    await withApp(app => {
      expect(Object.keys(createScopedSwaggerDocument(app, config, { include: [CatsModule] }).paths))
        .toEqual(["/cats"]);
    });
  });
});
