import { ApplicationStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: [ApplicationStatus.submitted],
  submitted: [
    ApplicationStatus.viewed,
    ApplicationStatus.interview,
    ApplicationStatus.offer,
    ApplicationStatus.rejected,
  ],
  viewed: [
    ApplicationStatus.interview,
    ApplicationStatus.offer,
    ApplicationStatus.rejected,
  ],
  interview: [ApplicationStatus.offer, ApplicationStatus.rejected],
  offer: [],
  rejected: [],
};

export class ApplicationEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly jobId: string,
    public status: ApplicationStatus,
  ) {}

  canTransitionTo(newStatus: ApplicationStatus): boolean {
    return VALID_TRANSITIONS[this.status]?.includes(newStatus) ?? false;
  }

  transitionTo(newStatus: ApplicationStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${this.status} to ${newStatus}`,
      );
    }
    this.status = newStatus;
  }
}
