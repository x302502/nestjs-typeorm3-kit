# NestJS TypeORM3 Kit Example

This directory contains a complete example application demonstrating how to use the `nestjs-typeorm3-kit` package with TypeORM 3 in a NestJS application.

## Overview

This example showcases:

- Multiple database connections (primary and secondary)
- Transaction management with `@DefTransaction` (the transactional layer is vendored in `nestjs-typeorm3-kit`)
- Domain-driven structure for organizing entities and modules
- TypeORM entity configuration and relationships

## Prerequisites

- Node.js >= 20 (required by NestJS 11)
- PostgreSQL (or other database supported by TypeORM)
- Yarn, NPM, pnpm, or bun package manager

## Getting Started

### 1. Install Dependencies

```bash
# Using npm
npm install

# Using yarn
yarn install

# Using pnpm
pnpm install

# Using bun
bun install
```

### 2. Configure Database Connections

Start PostgreSQL with Docker. The container creates `primary_db` and `secondary_db` on first start:

```bash
yarn db:up      # docker compose up -d --wait
yarn db:down    # stop it (add -v to docker compose down to wipe the data)
```

If port 5432 is already taken, pick another one and use it for the app too:

```bash
DB_PORT=55432 yarn db:up
DB_PORT=55432 yarn start:dev
```

Using your own PostgreSQL instead? Create the two databases yourself:

```bash
psql -U postgres -c "CREATE DATABASE primary_db" -c "CREATE DATABASE secondary_db"
```

The example is configured with two database connections:

#### Primary Database (src/databases/primary.database.ts)

```typescript
const primaryDatabase = TypeOrmModule.forRootAsync({
  name: PRIMARY_CONNECTION, // primary connection
  useFactory: () => ({
    name: PRIMARY_CONNECTION, // @nestjs/typeorm reads it from these options on shutdown
    type: 'postgres',
    host: 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    username: 'postgres',
    password: 'Abc12345',
    database: 'primary_db',
    entities: [join(__dirname, '../domains/primary/**/*.entity.{ts,js}')],
    synchronize: true,
    autoLoadEntities: true,
    retryAttempts: 2,
    retryDelay: 1000,
  }),
  dataSourceFactory: async (options: DataSourceOptions) => {
    if (!options) {
      throw new Error('Invalid options passed');
    }
    return addTransactionalDataSource({
      dataSource: new DataSource(options),
      name: PRIMARY_CONNECTION,
    });
  },
});
const secondaryDatabase = TypeOrmModule.forRootAsync({
  name: SECONDARY_CONNECTION, // secondary connection
  useFactory: () => ({
    name: SECONDARY_CONNECTION, // @nestjs/typeorm reads it from these options on shutdown
    type: 'postgres',
    host: 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    username: 'postgres',
    password: 'Abc12345',
    database: 'secondary_db',
    entities: [join(__dirname, '../domains/secondary/**/*.entity.{ts,js}')],
    synchronize: true,
    autoLoadEntities: true,
    retryAttempts: 2,
    retryDelay: 1000,
  }),
  dataSourceFactory: async (options: DataSourceOptions) => {
    if (!options) {
      throw new Error('Invalid options passed');
    }
    return addTransactionalDataSource({
      dataSource: new DataSource(options),
      name: SECONDARY_CONNECTION,
    });
  },
});
// databases/index.ts
import { primaryDatabase } from './primary.database';
import { secondaryDatabase } from './secondary.database';

export const databases = [primaryDatabase, secondaryDatabase];
```

#### Secondary Database (src/databases/secondary.database.ts)

Similarly configured with different database name and connection parameters.

### 3. Entity Configuration

Entities should be placed in the appropriate domain directory:

- Primary database entities: `src/domains/primary/`
- Secondary database entities: `src/domains/secondary/`

Example entity structure:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Book {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 500 })
  name!: string;

  @Column('text')
  description!: string;
}

import { Repository, FindOneOptions, DeepPartial, SaveOptions } from 'typeorm';

export class BaseRepo<Entity> extends Repository<Entity> {
  async findOrCreate(value: Partial<Entity>, options?: FindOneOptions<Entity>) {
    let entity = (await this.findOne(options)) as any;

    if (!entity) {
      entity = await this.save(value as DeepPartial<Entity>);
    }
    return entity;
  }
  async saves(entities: DeepPartial<Entity>[], options: SaveOptions = {}) {
    const newOption: SaveOptions = { reload: true, chunk: 10000, ...options };
    return this.save(entities, newOption);
  }
}

import { Book } from './book.entity';
import { DefEntityRepository } from 'nestjs-typeorm3-kit';
import { BaseRepo } from '../../base.repo';

@DefEntityRepository(Book)
export class BookRepo extends BaseRepo<Book> {}
```

### 4. Using Transactions

The example uses `@DefTransaction` for transaction management:

```typescript
import { Injectable } from '@nestjs/common';
import { ListDemoReq } from './dto';
import { DefTransaction, InjectRepo } from 'nestjs-typeorm3-kit';
import { PhotoRepo } from '~/domains/primary/photo/photo.repo';
import { BookRepo } from '~/domains/primary/book/book.repo';
import { DataLogRepo } from '~/domains/secondary/data-log/data-log.repo';
import { SECONDARY_CONNECTION } from '~/common/constants';
import { ExampleRepo } from '~/domains/secondary/example/example.repo';

@Injectable()
export class DemoService {
  constructor(
    readonly photoRepo: PhotoRepo,
    readonly bookRepo: BookRepo,

    @InjectRepo(ExampleRepo, SECONDARY_CONNECTION)
    readonly exampleRepo: ExampleRepo,

    @InjectRepo(DataLogRepo, SECONDARY_CONNECTION)
    readonly dataLogRepo: DataLogRepo,
  ) {}

  async getData(params: ListDemoReq) {
    return this.bookRepo.find(params);
  }

  @DefTransaction({ connectionName: SECONDARY_CONNECTION })
  create(body: any) {
    return this.exampleRepo.save(body);
  }
}

// app.module.ts
@Module({
  imports: [...databases, ...modules],
})
export class AppModule {}
```

### 5. Running the Example

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## Project Structure

```
├── src/
│   ├── app.module.ts          # Main application module
│   ├── main.ts                # Application entry point
│   ├── common/                # Common utilities and constants
│   ├── databases/             # Database connection configurations
│   ├── domains/               # Domain entities organized by database
│   └── modules/               # Feature modules
├── test/                      # Test files
├── docker/init.sql            # Creates primary_db and secondary_db
├── docker-compose.yml         # PostgreSQL for local runs
├── nest-cli.json              # NestJS CLI configuration
├── package.json               # Dependencies and scripts
└── tsconfig.json              # TypeScript configuration
```

## Additional Configuration

### Environment Variables

For production use, replace hardcoded database credentials with environment variables:

```typescript
useFactory: () => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'primary_db',
  // ...
}),
```

## Learn More

For complete documentation, see the [package README](../README.md) and the [guides in `docs/`](../docs/README.md).
