import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { UserModule } from './user/user.module';
import { OrganizationModule } from './organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'password123',
      database: process.env.DB_NAME || 'onboarding',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      uuidExtension: 'pgcrypto',
    }),
    UserModule,
    OrganizationModule,
  ],
  controllers: [AppController],  
  providers: [],
})
export class AppModule {}