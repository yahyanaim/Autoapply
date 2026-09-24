import { Injectable } from '@nestjs/common';
import { JobService } from '../../job/application/job.service';
import { ResumeOperationsReadService } from '../../resume/application/resume-operations-read.service';
import { BetaRegistrationGateService } from '../../beta/application/beta-registration-gate.service';
import { NotificationOperationsReadService } from '../../notification/application/notification-operations-read.service';
import { ApplicationOperationsReadService } from '../../application-tracker/application/application-operations-read.service';

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly jobs: JobService,
    private readonly resumes: ResumeOperationsReadService,
    private readonly betaGate: BetaRegistrationGateService,
    private readonly notifications: NotificationOperationsReadService,
    private readonly applications: ApplicationOperationsReadService,
  ) {}

  listJobs(input: Parameters<JobService['listForAdmin']>[0]) {
    return this.jobs.listForAdmin(input);
  }

  getJob(jobId: string) {
    return this.jobs.getForAdmin(jobId);
  }

  listResumeFailures(input: Parameters<ResumeOperationsReadService['listFailures']>[0]) {
    return this.resumes.listFailures(input);
  }

  getResumeFailure(resumeId: string) {
    return this.resumes.getFailure(resumeId);
  }

  getBetaGate() {
    return this.betaGate.getAdminSummary();
  }

  getNotifications(input: Parameters<NotificationOperationsReadService['getDeliverySummary']>[0]) {
    return this.notifications.getDeliverySummary(input);
  }

  getApplications(input: Parameters<ApplicationOperationsReadService['getAggregate']>[0]) {
    return this.applications.getAggregate(input);
  }
}
