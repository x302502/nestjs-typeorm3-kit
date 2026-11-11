import { Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { resolve } from "path";
import "reflect-metadata";
import { InjectRepo } from "../..";
import { DefRepositoryModule } from ".";
import { AsyncItem, AsyncItemRepo } from "./__fixtures__/async-item.repo";

describe("DefRepositoryModule", () => {
  describe("forFeature", () => {
    it("injects independent repositories for default and named DataSources", async () => {
      @Injectable()
      class ItemService {
        constructor(
          @InjectRepo(AsyncItemRepo) readonly primary: AsyncItemRepo,
          @InjectRepo(AsyncItemRepo, "analytics") readonly analytics: AsyncItemRepo
        ) {}
      }

      @Module({
        imports: [
          TypeOrmModule.forRoot({
            type: "sqljs",
            entities: [AsyncItem],
            synchronize: true,
          }),
          TypeOrmModule.forRoot({
            name: "analytics",
            type: "sqljs",
            entities: [AsyncItem],
            synchronize: true,
          }),
          DefRepositoryModule.forFeature([AsyncItemRepo]),
          DefRepositoryModule.forFeature([AsyncItemRepo], "analytics"),
        ],
        providers: [ItemService],
      })
      class AppModule {}

      const app = await NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
      });
      try {
        await app.init();
        const service = app.get(ItemService);
        await service.primary.save({ label: "primary" });
        await service.analytics.save({ label: "analytics" });
        expect((await service.primary.find()).map(item => item.label))
          .toEqual(["primary"]);
        expect((await service.analytics.find()).map(item => item.label))
          .toEqual(["analytics"]);
      } finally {
        await app.close();
      }
    });
  });

  describe("forRootAsync custom discovery", () => {
    const globPattern = resolve(process.cwd(), "src/repository/module/__fixtures__/async-item.repo.ts");

    it("discovers a repository from a one-time async factory and injects it", async () => {
      let calls = 0;
      const repositories = await DefRepositoryModule.forRootAsync({
        useFactory: async () => {
          calls++;
          return { globPattern };
        },
      });

      @Module({
        imports: [
          TypeOrmModule.forRoot({
            type: "sqljs",
            entities: [AsyncItem],
            synchronize: true,
          }),
          repositories,
        ],
      })
      class AppModule {}

      const app = await NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
      });
      try {
        await app.init();
        const repository = app.get(AsyncItemRepo);
        await repository.save({ label: "discovered" });
        expect(await repository.findOneBy({ id: 1 }))
          .toMatchObject({ label: "discovered" });
        expect(calls).toBe(1);
      } finally {
        await app.close();
      }
    });

    it("resolves a plain class factory without constructing it twice", async () => {
      let constructions = 0;
      class OptionsFactory {
        constructor() {
          constructions++;
        }
        createDefRepositoryOptions() {
          return { globPattern };
        }
      }

      const repositories = await DefRepositoryModule.forRootAsync({
        useClass: OptionsFactory,
      });
      @Module({
        imports: [
          TypeOrmModule.forRoot({
            type: "sqljs",
            entities: [AsyncItem],
            synchronize: true,
          }),
          repositories,
        ],
      })
      class AppModule {}
      const app = await NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
      });
      try {
        await app.init();
        expect(app.get(AsyncItemRepo)).toBeInstanceOf(AsyncItemRepo);
        expect(constructions).toBe(1);
      } finally {
        await app.close();
      }
    });

    it("rejects missing and empty discovery options", async () => {
      await expect(
        DefRepositoryModule.forRootAsync(null as unknown as never)
      ).rejects.toThrow(/requires options/);
      await expect(
        DefRepositoryModule.forRootAsync({ useFactory: () => ({ globPattern: "" }) })
      ).rejects.toThrow(/globPattern from options/);
    });

    it("rejects DI options before they can register repositories on the wrong DataSource", async () => {
      await expect(DefRepositoryModule.forRootAsync({
        inject: ["CONNECTION"],
        useFactory: (name: string) => ({ globPattern, dataSource: name }),
      } as never)).rejects.toThrow(/before Nest bootstraps/);
      await expect(DefRepositoryModule.forRootAsync({
        useExisting: class OptionsFactory {},
      } as never)).rejects.toThrow(/before Nest bootstraps/);
    });
  });
});
