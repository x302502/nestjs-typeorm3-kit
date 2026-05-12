import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { addTransactionalDataSource } from 'nestjs-typeorm3-kit';
import { PRIMARY_CONNECTION } from '~/common/constants';

const primaryDatabase = TypeOrmModule.forRootAsync({
  name: PRIMARY_CONNECTION, // primary connection
  useFactory: () => ({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'Abc12345',
    database: 'primary_db',
    entities: [join(__dirname, './domains/primary/**/*.entity.{ts,js}')],
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
export { primaryDatabase };
