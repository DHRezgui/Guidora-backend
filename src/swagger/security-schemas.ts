import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

// Décorateur pour endpoints protégés par JWT
export const ApiAuth = () =>
  applyDecorators(
    ApiBearerAuth('JWT-auth'), 
    ApiUnauthorizedResponse({
      description: 'Non autorisé - Token manquant ou invalide',
      schema: {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
        },
      },
    }),
  );