import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResetTourUserDto {
  @ApiProperty({
    description: 'Target user id to reactivate this tour for',
    format: 'uuid',
  })
  @IsUUID()
  userId: string;
}
