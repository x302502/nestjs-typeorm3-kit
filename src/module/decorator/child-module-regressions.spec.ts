import "reflect-metadata";
import { forwardRef, Global, INestApplication, Inject, Module, OnModuleInit, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ChildModule, DefController, DefGet, createScopedSwaggerDocument } from "../..";

async function withApp<T>(
  rootModule: Type<object>,
  run: (app: INestApplication, url: string) => Promise<T>,
) {
  const app = await NestFactory.create(rootModule, { logger: false, abortOnError: false });
  try {
    await app.listen(0, "127.0.0.1");
    return await run(app, await app.getUrl());
  } finally {
    await app.close();
  }
}

function statusController(path: string) {
  @DefController(path)
  class StatusController {
    @DefGet()
    status() {
      return { ok: path };
    }
  }
  return StatusController;
}

describe("ChildModule scoping regressions", () => {
  it.each([
    ["original first", true],
    ["scoped parent first", false],
  ])("routes a nested module under its parent when the original is also imported (%s)", async (_name, originalFirst) => {
    class Greeter {
      greeting = "hi";
    }
    const initialized: string[] = [];

    @DefController("inner")
    class InnerController {
      constructor(@Inject(Greeter) private readonly greeter: Greeter) {}
      @DefGet()
      get() {
        return { greeting: this.greeter.greeting };
      }
    }

    @ChildModule({ prefix: "inner", controllers: [InnerController], providers: [Greeter] })
    class InnerModule implements OnModuleInit {
      constructor(@Inject(Greeter) private readonly greeter: Greeter) {}
      onModuleInit() {
        initialized.push(this.greeter.greeting);
      }
    }

    @ChildModule({ prefix: "outer", imports: [InnerModule] })
    class OuterModule {}

    @Module({ imports: originalFirst ? [InnerModule, OuterModule] : [OuterModule, InnerModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      for (const path of ["/inner/inner", "/outer/inner/inner"]) {
        const response = await fetch(`${url}${path}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ greeting: "hi" });
      }
    });
    expect(initialized).toHaveLength(2);
  });

  it("starts when a plain wrapper module re-exports a child module imported under a prefix", async () => {
    class SharedService {
      value = "shared";
    }

    @ChildModule({ prefix: "inner", controllers: [statusController("status")], providers: [SharedService], exports: [SharedService] })
    class InnerModule {}

    @Module({ imports: [InnerModule], exports: [InnerModule] })
    class WrapperModule {}

    @DefController("consumer")
    class ConsumerController {
      constructor(@Inject(SharedService) private readonly shared: SharedService) {}
      @DefGet()
      get() {
        return { value: this.shared.value };
      }
    }

    @ChildModule({ prefix: "outer", imports: [WrapperModule], controllers: [ConsumerController] })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      const status = await fetch(`${url}/outer/inner/status`);
      expect(status.status).toBe(200);
      expect(await status.json()).toEqual({ ok: "status" });
      const consumer = await fetch(`${url}/outer/consumer`);
      expect(await consumer.json()).toEqual({ value: "shared" });
    });
  });

  it("re-exports a forward-referenced child under its parent's prefix", async () => {
    class SharedService {
      value = "forwarded";
    }

    @ChildModule({
      prefix: "inner",
      providers: [SharedService],
      exports: [SharedService],
    })
    class InnerModule {}

    @Module({ imports: [forwardRef(() => InnerModule)], exports: [InnerModule] })
    class WrapperModule {}

    @DefController("consumer")
    class ConsumerController {
      constructor(@Inject(SharedService) private readonly shared: SharedService) {}
      @DefGet()
      get() {
        return { value: this.shared.value };
      }
    }

    @ChildModule({
      prefix: "outer",
      imports: [WrapperModule],
      controllers: [ConsumerController],
    })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      const response = await fetch(`${url}/outer/consumer`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ value: "forwarded" });
    });
  });

  it("keeps the prefix for modules imported by a dynamic module under a prefixed parent", async () => {
    @ChildModule({ prefix: "leaf", controllers: [statusController("status")] })
    class LeafModule {}

    @Module({})
    class DynamicHost {
      static register() {
        return { module: DynamicHost, imports: [LeafModule] };
      }
    }

    @ChildModule({ prefix: "outer", imports: [DynamicHost.register()] })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      const response = await fetch(`${url}/outer/leaf/status`);
      expect(response.status).toBe(200);
      expect(await fetch(`${url}/leaf/status`).then(r => r.status)).toBe(404);
    });
  });

  it("scopes promised dynamic module imports", async () => {
    @ChildModule({ prefix: "leaf", controllers: [statusController("status")] })
    class LeafModule {}

    @ChildModule({ prefix: "outer", imports: [Promise.resolve({ module: LeafModule })] })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      const response = await fetch(`${url}/outer/leaf/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: "status" });
    });
  });

  it("re-exports a promised dynamic module from a module imported under a prefix", async () => {
    // Same shape as DefRepositoryModule.forRootAsync() wrapped in a repo module.
    class Greeter {
      greeting = "hi";
    }
    @Module({})
    class AsyncModule {
      static forRootAsync() {
        return Promise.resolve({ module: AsyncModule, providers: [Greeter], exports: [Greeter] });
      }
    }

    @Module({ imports: [AsyncModule.forRootAsync()], exports: [AsyncModule] })
    class WrapperModule {}

    @DefController("greet")
    class GreetController {
      constructor(@Inject(Greeter) private readonly greeter: Greeter) {}
      @DefGet()
      get() {
        return { greeting: this.greeter.greeting };
      }
    }

    @ChildModule({ prefix: "client", imports: [WrapperModule], controllers: [GreetController] })
    class ClientModule {}

    @Module({ imports: [ClientModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      const response = await fetch(`${url}/client/greet`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ greeting: "hi" });
    });
  });

  it("shares route-less modules (plain, @Global, promised) across prefixes", async () => {
    let created = 0;
    class Cache {
      id = ++created;
    }
    @Module({ providers: [Cache], exports: [Cache] })
    class CacheModule {}

    let globalCreated = 0;
    @Global()
    @Module({ providers: [{ provide: "CONFIG", useFactory: () => ++globalCreated }], exports: ["CONFIG"] })
    class ConfigModule {}

    let asyncCreated = 0;
    class Repo {
      id = ++asyncCreated;
    }
    @Module({})
    class AsyncRepoModule {
      static forRootAsync() {
        return Promise.resolve({ module: AsyncRepoModule, providers: [Repo], exports: [Repo] });
      }
    }
    @Module({ imports: [AsyncRepoModule.forRootAsync()], exports: [AsyncRepoModule] })
    class RepoWrapperModule {}

    const controllerFor = (path: string) => {
      @DefController(path)
      class SharedController {
        constructor(
          @Inject(Cache) private readonly cache: Cache,
          @Inject(Repo) private readonly repo: Repo,
          @Inject("CONFIG") private readonly config: number,
        ) {}
        @DefGet()
        get() {
          return { cache: this.cache.id, repo: this.repo.id, config: this.config };
        }
      }
      return SharedController;
    };

    @ChildModule({
      prefix: "a",
      imports: [CacheModule, ConfigModule, RepoWrapperModule],
      controllers: [controllerFor("x")],
    })
    class AModule {}
    @ChildModule({
      prefix: "b",
      imports: [CacheModule, ConfigModule, RepoWrapperModule],
      controllers: [controllerFor("x")],
    })
    class BModule {}

    @Module({ imports: [AModule, BModule] })
    class AppModule {}

    await withApp(AppModule, async (_app, url) => {
      for (const prefix of ["a", "b"]) {
        const response = await fetch(`${url}/${prefix}/x`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ cache: 1, repo: 1, config: 1 });
      }
    });
    expect([created, globalCreated, asyncCreated]).toEqual([1, 1, 1]);
  });

  it("documents child routes when the parent is included with deepScanRoutes", async () => {
    @ChildModule({ prefix: "inner", controllers: [statusController("status")] })
    class InnerModule {}

    @ChildModule({ prefix: "outer", imports: [InnerModule] })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    await withApp(AppModule, async app => {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
        include: [OuterModule],
        deepScanRoutes: true,
      });
      expect(Object.keys(document.paths)).toEqual(["/outer/inner/status"]);
    });
  });

  it("includes every prefixed mount when Swagger filters by the public child module", async () => {
    @ChildModule({ prefix: "inner", controllers: [statusController("status")] })
    class InnerModule {}

    @ChildModule({ prefix: "alpha", imports: [InnerModule] })
    class AlphaModule {}

    @ChildModule({ prefix: "beta", imports: [InnerModule] })
    class BetaModule {}

    @Module({ imports: [AlphaModule, BetaModule] })
    class AppModule {}

    await withApp(AppModule, async app => {
      const document = createScopedSwaggerDocument(app, new DocumentBuilder().build(), {
        include: [InnerModule],
      });
      expect(Object.keys(document.paths).sort()).toEqual([
        "/alpha/inner/status",
        "/beta/inner/status",
      ]);
    });
  });

  it("documents a child module included directly when its parent adds no prefix", async () => {
    @ChildModule({ prefix: "inner", controllers: [statusController("status")] })
    class InnerModule {}

    @ChildModule({ imports: [InnerModule] })
    class UnprefixedModule {}

    @Module({ imports: [UnprefixedModule] })
    class AppModule {}

    await withApp(AppModule, async app => {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
        include: [InnerModule],
      });
      expect(Object.keys(document.paths)).toEqual(["/inner/status"]);
    });
  });
});
