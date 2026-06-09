import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class UpsertOrganizationJourneyBlueprintDto {
  @IsObject()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Full JourneyBlueprint JSON (validated against SDK schema)',
    example: {
      id: 'custom.crm.pipeline',
      name: 'CRM — pipeline commercial',
      description: 'Parcours découverte du pipeline et création de lead.',
      vertical: 'saas',
      intent: 'primary-action',
      minResolvedSteps: 2,
      priority: 5,
      steps: [
        {
          semanticRole: 'saas.dashboard-overview',
          title: 'Vue pipeline',
          description: 'Consultez votre pipeline commercial.',
          required: true,
          targetHints: {
            semanticTokens: ['pipeline', 'deals', 'crm'],
            selectorHints: ['[data-tour-id="crm-pipeline"]'],
            elementTags: ['a', 'button'],
          },
        },
      ],
    },
  })
  blueprint!: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: false })
  isPublished?: boolean;
}
