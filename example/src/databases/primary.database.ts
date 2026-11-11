import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { addTransactionalDataSource } from 'nestjs-typeorm3-kit';
import { PRIMARY_CONNECTION } from '~/common/constants';

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
    // Fail loudly instead of dropping `{ id: undefined }` / `{ id: null }` from a filter
    invalidWhereValuesBehavior: { undefined: 'throw', null: 'throw' },
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
export { primaryDatabase };
