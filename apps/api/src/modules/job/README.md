# job

Approved public ATS ingestion uses Greenhouse, Lever and Ashby APIs. Authenticated
users may also capture a job page they opened through `POST /jobs/capture`.
Captured jobs are tenant-scoped and deduplicated by user plus canonical URL.
There is no server-side LinkedIn or Indeed crawler.
