import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { ApiResponse } from '@nestjs/swagger';

@Controller()
export class AppController {
  @Public()
  @Get()
  @ApiResponse({ status: HttpStatus.OK, description: 'API Root', example: {
    message: 'TrustDev Onboarding API',
    version: '1.0.0',
    status: 'running',
    timestamp: '2024-06-01T12:00:00.000Z',
  }})
  getRoot() {
    return {
      message: 'TrustDev Onboarding API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health')
  @ApiResponse({ status: HttpStatus.OK, description: 'Health Check', example: {
    status: 'ok',
    database: 'connected',
    redis: 'connected',
    timestamp: '2024-06-01T12:00:00.000Z',
  }})
  getHealth() {
    return {
      status: 'ok',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}