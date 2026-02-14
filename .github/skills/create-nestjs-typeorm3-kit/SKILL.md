# Create NestJS project with nestjs-typeorm3-kit

Use this skill when you need to scaffold a new NestJS project and wire `nestjs-typeorm3-kit` from the beginning.

## Goal

Create a runnable NestJS app that uses:

- `nestjs-typeorm3-kit`
- `typeorm`
- `typeorm-transactional`
- `@nestjs/typeorm`

## Steps

1. Create project:

   ```bash
   npx @nestjs/cli@latest new <project-name>
   ```

2. Install dependencies:

   ```bash
   cd <project-name>
   npm install nestjs-typeorm3-kit typeorm typeorm-transactional @nestjs/typeorm reflect-metadata rxjs
   npm install -D @types/node
   ```

3. Install database driver (pick one):

   ```bash
   # postgres
   npm install pg
   # mysql
   npm install mysql2
   # sqlite
   npm install sqlite3
   ```

4. In `main.ts`, call `setupTransactionContext()` before creating app.

5. In `app.module.ts`, configure `TypeOrmModule.forRootAsync()` and return datasource via `addTransactionalDataSource(...)`.

6. Create repositories with `@DefEntityRepository(...)` and register by `DefRepositoryModule.forRootAsync(...)` or `DefRepositoryModule.forFeature(...)`.

7. Use transactions in service methods with `@DefTransaction()`.

8. Run app:

   ```bash
   npm run start:dev
   ```

## Reference

- Library setup examples: `README.md` at repository root
- Full sample app: `example/`
