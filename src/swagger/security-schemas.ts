import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

// Decorator for JWT-protected endpoints
export const ApiAuth = () =>
  applyDecorators(
    ApiBearerAuth('JWT-auth'), 
    ApiUnauthorizedResponse({
      description: 'Unauthorized - Missing or invalid token',
      schema: {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
        },
      },
    }),
  );