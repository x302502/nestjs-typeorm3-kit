import "reflect-metadata";
import { forwardRef, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ChildModule, DefController, DefGet } from "../..";

describe("ChildModule routes", () => {
  it("mounts a shared child under each parent's prefix without combining paths", async () => {
    @DefController("items")
    class ItemsController {
      @DefGet("list")
      list() {
        return { ok: true };
      }
    }

    @ChildModule({ prefix: "inner", controllers: [ItemsController] })
    class SharedModule {}

    @ChildModule({ prefix: "alpha", imports: [SharedModule] })
    class AlphaModule {}

    @ChildModule({ prefix: "beta", imports: [SharedModule] })
    class BetaModule {}

    @Module({ imports: [AlphaModule, BetaModule] })
    class AppModule {}

    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      await app.listen(0, "127.0.0.1");
      const baseUrl = await app.getUrl();
      for (const prefix of ["alpha", "beta"]) {
        const response = await fetch(`${baseUrl}/${prefix}/inner/items/list`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
      }
      const misplaced = await fetch(`${baseUrl}/beta/alpha/inner/items/list`);
      expect(misplaced.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("preserves nested paths and providers from a dynamic module import", async () => {
    class MessageService {
      message = "dynamic";
    }

    @DefController("messages")
    class MessagesController {
      constructor(private readonly service: MessageService) {}

      @DefGet()
      list() {
        return { message: this.service.message };
      }
    }

    @ChildModule({ prefix: "leaf", controllers: [MessagesController] })
    class LeafModule {}

    @ChildModule({
      prefix: "middle",
      imports: [{ module: LeafModule, providers: [MessageService] }],
    })
    class MiddleModule {}

    @ChildModule({ prefix: "outer", imports: [MiddleModule] })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/outer/middle/leaf/messages`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: "dynamic" });
    } finally {
      await app.close();
    }
  });

  it("resolves forward-referenced child routes under their parent", async () => {
    @DefController("status")
    class StatusController {
      @DefGet()
      status() {
        return { ready: true };
      }
    }

    @ChildModule({ prefix: "inner", controllers: [StatusController] })
    class InnerModule {}

    @ChildModule({ prefix: "outer", imports: [forwardRef(() => InnerModule)] })
    class OuterModule {}

    @Module({ imports: [OuterModule] })
    class AppModule {}

    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/outer/inner/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ready: true });
    } finally {
      await app.close();
    }
  });
});

