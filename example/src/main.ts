import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  configSwaggerDocument,
  setupTransactionContext,
} from 'nestjs-typeorm3-kit';
import { INestApplication } from '@nestjs/common';

const configSwagger = (app: INestApplication) => {
  const options = new DocumentBuilder()
    .setTitle('SWAGGER_TITLE')
    .setDescription('SWAGGER_DESCRIPTION')
    .setVersion('SWAGGER_VERSION')
    .addSecurity('bearer', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .build();

  const document = SwaggerModule.createDocument(app as any, options, {
    // extraModels: [PageResponse]
  });
  configSwaggerDocument(app, document, 'swagger');
};

async function bootstrap() {
  // Defaults to StorageDriver.AUTO so this also works on Bun.
  // For explicit control: setupTransactionContext({ storageDriver: StorageDriver.ASYNC_LOCAL_STORAGE })
  setupTransactionContext();
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;
  app.enableCors({ origin: '*' });
  configSwagger(app);
  await app.listen(port);
  console.log(
    `Server start on port ${port}. Open http://localhost:${port} to see results`,
  );
  console.log(`API DOCUMENT Open http://localhost:${port}/swagger`);
  console.log(`API DOCUMENT JSON Open http://localhost:${port}/swagger-json`);
  console.log('TIMEZONE: ', process.env.TZ);
}
bootstrap();
