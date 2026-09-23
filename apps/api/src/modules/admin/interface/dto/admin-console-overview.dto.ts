import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Aggregate-only Admin Console response; intentionally excludes incidents and user data. */
export class AdminConsoleOverviewResponseDto {
  @ApiProperty({ minimum: 0, description: 'Users in the explicit suspended status' })
  @IsInt()
  @Min(0)
  suspendedUserCount!: number;
}
