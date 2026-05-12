import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { addTransactionalDataSource } from 'nestjs-typeorm3-kit';
import { SECONDARY_CONNECTION } from '~/common/constants';

const secondaryDatabase = TypeOrmModule.forRootAsync({
  name: SECONDARY_CONNECTION, // primary connection
  useFactory: () => ({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'Abc12345',
    database: 'secondary_db',
    entities: [join(__dirname, './domains/secondary/**/*.entity.{ts,js}')],
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
export { secondaryDatabase };
