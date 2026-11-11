import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { setupTransactionContext } from 'nestjs-typeorm3-kit';
import { AppModule } from './../src/app.module';

// Needs the Postgres databases from the README (primary_db, secondary_db).
describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    setupTransactionContext();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/mock/example (GET)', () => {
    return request(app.getHttpServer())
      .get('/mock/example')
      .expect(200)
      .expect({ moduleName: 'Example', data: {} });
  });

  it('/client/demo/list (POST) writes inside a transaction, then (GET) reads', async () => {
    await request(app.getHttpServer())
      .post('/client/demo/list')
      .send({ name: 'e2e', description: 'created by e2e' })
      .expect(200);
    await request(app.getHttpServer()).get('/client/demo/list').expect(200);
  });
});
