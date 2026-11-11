import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ChildModule, DefController, DefGet } from "../..";

describe("ChildModule route prefixes", () => {
  it("normalizes extra slashes without changing controller paths", async () => {
    @DefController("health")
    class HealthController {
      @DefGet("ping")
      ping() {
        return { alive: true };
      }
    }

    @ChildModule({ prefix: "//api/v1//", controllers: [HealthController] })
    class ApiModule {}

    @Module({ imports: [ApiModule] })
    class AppModule {}

    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/api/v1/health/ping`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ alive: true });
    } finally {
      await app.close();
    }
  });
});
