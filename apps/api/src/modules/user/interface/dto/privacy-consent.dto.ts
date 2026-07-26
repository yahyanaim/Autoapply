import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

export class PrivacyConsentDto {
  @ApiProperty({
    example: true,
    description: 'Consent to storing resume data and processing it with configured AI providers',
  })
  @IsBoolean()
  @Equals(true, { message: 'Data-processing consent must be accepted' })
  acceptDataProcessing!: boolean;
}
