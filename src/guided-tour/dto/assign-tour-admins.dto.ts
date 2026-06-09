import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AssignTourSubmissionMessageFields } from './assign-tour-submission-message.dto';

export class AssignTourAdminsDto extends AssignTourSubmissionMessageFields {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Un seul administrateur modérateur pour ce parcours',
    minItems: 1,
    maxItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  adminIds: string[];
}
