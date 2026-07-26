import { RemoteType } from '../enums';
import { Skill } from './resume';

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  sizeRange: string | null;
  industry: string | null;
}

export interface Job {
  id: string;
  source: string | null;
  sourceUrl: string | null;
  title: string;
  companyId: string | null;
  description: string | null;
  location: string | null;
  remoteType: RemoteType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
  company?: Company | null;
  skills?: Skill[];
}
