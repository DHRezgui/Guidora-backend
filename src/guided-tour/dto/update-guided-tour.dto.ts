import { PartialType } from "@nestjs/swagger";
import { CreateGuidedTourDto } from "./create-guided-tour.dto";

export class UpdateGuidedTourDto extends PartialType(CreateGuidedTourDto) {}