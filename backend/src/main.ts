import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  // Note: `origin: '*'` combined with `credentials: true` is invalid per the
  // CORS spec — browsers reject a wildcard Access-Control-Allow-Origin when
  // credentials are involved. Since the app doesn't rely on cookies (it uses
  // Bearer tokens), credentials support is disabled here to keep the
  // wildcard origin valid. If cookie-based auth is added later, this must
  // be switched to an explicit origin allowlist instead of '*'.
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: false,
  });

  // Normalize duplicate slashes in request URLs (e.g. //auth/signup-owner -> /auth/signup-owner)
  app.use((req: any, res: any, next: any) => {
    if (req.url) {
      req.url = req.url.replace(/\/{2,}/g, '/');
    }
    next();
  });

  // Enable Global Validation Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Configure Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Restaurant ERP & POS API')
    .setDescription('Full REST APIs for multi-role restaurant management and POS SaaS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`\n========================================`);
  console.log(`Backend server successfully started on: http://0.0.0.0:${port}`);
  console.log(`Swagger documentation available on: http://0.0.0.0:${port}/api/docs`);
  console.log(`========================================\n`);
}
bootstrap();
