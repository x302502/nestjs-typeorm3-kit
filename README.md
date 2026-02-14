# nestjs-typeorm3-kit

[![npm](https://img.shields.io/npm/v/nestjs-typeorm3-kit)](https://www.npmjs.com/package/nestjs-typeorm3-kit) ![MIT License](https://img.shields.io/npm/l/nestjs-typeorm3-kit.svg)

## [Node.js] nestjs-typeorm3-kit

### Installation

#### NPM

```bash
npm install nestjs-typeorm3-kit typeorm-transactional
```

#### Yarn

```bash
yarn add nestjs-typeorm3-kit typeorm-transactional
```

#### pnpm

```bash
pnpm add nestjs-typeorm3-kit typeorm-transactional
```

#### bun

```bash
bun add nestjs-typeorm3-kit typeorm-transactional
```

### Config after install

#### Use @DefEntityRepository

For using `@DefEntityRepository` instead of `@EntityRepository` of typeorm 0.2, you need to add the following code in `main.ts` or `app.module.ts`:

```typescript
import { TypeOrmModule } from "@nestjs/typeorm";

TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: "postgres",
    host: "localhost",
    port: 5432,
    username: "postgres",
    password: "Abc12345",
    database: "primary_db",
    entities: [join(__dirname, "./domains/primary/**/*.entity.{ts,js}")],
    synchronize: true,
    autoLoadEntities: true,
    retryAttempts: 2,
    retryDelay: 1000,
  }),
  dataSourceFactory: async (options: DataSourceOptions) => {
    if (!options) {
      throw new Error("Invalid options passed");
    }
    return addTransactionalDataSource({
      dataSource: new DataSource(options),
      name: PRIMARY_CONNECTION,
    });
  },
});
```

#### Use RepositoryWrapper fix findOne typeOrm (change return first to return null)

```typescript
import { RepositoryWrapper } from "nestjs-typeorm3-kit";

export class BaseRepo<Entity> extends RepositoryWrapper<Entity> {}
```

#### create Repository module Use @DefRepositoryModule

```typescript
import { Module } from "@nestjs/common";
import { join } from "path";

import { PRIMARY_CONNECTION } from "~/common/constants";
import { DefRepositoryModule } from "nestjs-typeorm3-kit";
@Module({
  imports: [
    DefRepositoryModule.forRootAsync({
      useFactory: () => ({
        globPattern: join(__dirname, "./**/*.repo.{ts,js}"),
        dataSource: PRIMARY_CONNECTION,
      }),
    }),
  ],
  exports: [DefRepositoryModule],
})
export class PrimaryRepoModule {}
```

or

```typescript
import { Module } from "@nestjs/common";
import { join } from "path";

import { PRIMARY_CONNECTION } from "~/common/constants";
import { DefRepositoryModule } from "nestjs-typeorm3-kit";
@Module({
  imports: [
    DefRepositoryModule.forFeature([BookRepo, PhotoRepo], PRIMARY_CONNECTION),
  ],
  exports: [DefRepositoryModule],
})
export class PrimaryRepoModule {}
```

#### Use @DefTransaction

```typescript
import { Injectable } from "@nestjs/common";
import { DefTransaction, InjectRepo } from "nestjs-typeorm3-kit";
import { PhotoRepo } from "~/domains/primary/photo/photo.repo";
import { BookRepo } from "~/domains/primary/book/book.repo";

const PRIMARY_CONNECTION = "default";
const SECONDARY_CONNECTION = "secondary_db";
@Injectable()
export class DemoService {
  constructor(
    readonly photoRepo: PhotoRepo,
    @InjectRepo(BookRepo, PRIMARY_CONNECTION)
    readonly bookRepo: BookRepo
  ) {}

  @DefTransaction()
  create(body: any) {
    return this.photoRepo.save(body);
  }
}

// secondary connection
@Injectable()
export class DemoService {
  constructor(
    @InjectRepo(ExampleRepo, SECONDARY_CONNECTION)
    readonly exampleRepo: ExampleRepo,
    @InjectRepo(DataLogRepo, SECONDARY_CONNECTION)
    readonly dataLogRepo: DataLogRepo
  ) {}

  @DefTransaction({ connectionName: SECONDARY_CONNECTION })
  create(body: any) {
    return this.photoRepo.save(body);
  }
}
```

#### Use wraper Controller and ChildModule

```typescript
import { DefController } from "nestjs-typeorm3-kit";

@Controller("demo")
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @DefGet()
  list(@Query() query: any) {
    return this.demoService.list(query);
  }

  @DefPost()
  create(@Body() body: any) {
    return this.demoService.create(body);
  }
}

// child module suport prefix route and API TAG swagger
@ChildModule({
  prefix: REFIX_MODULE.client,
  imports: [PrimaryRepoModule, SecondaryRepoModule],
  providers: [DemoService, ExampleService],
  controllers: [ExampleController, DemoController],
})
export class ClientModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {}
}
// setup swagger beautiful in main.ts
// main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { getFromContainer, MetadataStorage } from "class-validator";
import { SchemasObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

import { validationMetadatasToSchemas } from "class-validator-jsonschema";
import { setupTransactionContext } from "nestjs-typeorm3-kit";
import { INestApplication } from "@nestjs/common";

const configSwagger = (app: INestApplication) => {
  const options = new DocumentBuilder()
    .setTitle("SWAGGER_TITLE")
    .setDescription("SWAGGER_DESCRIPTION")
    .setVersion("SWAGGER_VERSION")
    .addSecurity("bearer", {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    })
    .build();

  const document = SwaggerModule.createDocument(app as any, options, {
    // extraModels: [PageResponse]
  });
  configSwaggerDocument(app, document, "swagger");
};

async function bootstrap() {
  setupTransactionContext();
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;
  app.enableCors({ origin: "*" });
  configSwagger(app);
  await app.listen(port);
  console.log(
    `Server start on port ${port}. Open http://localhost:${port} to see results`
  );
  console.log(`API DOCUMENT Open http://localhost:${port}/swagger`);
  console.log(`API DOCUMENT JSON Open http://localhost:${port}/swagger-json`);
  console.log("TIMEZONE: ", process.env.TZ);
}
bootstrap();
```

![Swagger UI](image.png)

#### Example

[Example](./example)

#### Agent skill (create NestJS project)

[Create NestJS project with nestjs-typeorm3-kit](./.github/skills/create-nestjs-typeorm3-kit/SKILL.md)

### Full document in wiki github

[FULL DOCUMENT](https://x302502.github.io/nestjs-typeorm3-kit/)
