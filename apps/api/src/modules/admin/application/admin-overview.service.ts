import { Injectable } from '@nestjs/common';
import { AuthService } from '../../auth/application/auth.service';

/** Thin Admin application delegate; Auth remains the owner of User status reads. */
@Injectable()
export class AdminOverviewService {
  constructor(private readonly auth: AuthService) {}

  async getOverview() {
    return {
      suspendedUserCount: await this.auth.countSuspendedUsersForAdmin(),
    };
  }
}
