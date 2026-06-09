import { IsUUID } from 'class-validator';

export class TransferProductionManagementDto {
  @IsUUID()
  adminId: string;
}
