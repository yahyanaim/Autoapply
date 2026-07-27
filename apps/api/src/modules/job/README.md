# job

Approved public ATS ingestion uses Greenhouse, Lever and Ashby APIs. Authenticated
users may also capture a job page they opened through `POST /jobs/capture`.
Captured jobs are tenant-scoped and deduplicated by user plus canonical URL.
There is no server-side LinkedIn or Indeed crawler.

`POST /jobs/discover` accepts a ready resume, refreshes operator-configured
approved ATS boards subject to a refresh TTL, scores at most 500 complete
candidate records, and returns no more than 20 explainable recommendations.
The response identifies already-tracked jobs so the UI cannot accidentally
create a duplicate application.

Configure public sources with a comma-separated environment value:

```dotenv
JOB_DISCOVERY_SOURCES=greenhouse:company-board,lever:company,ashby:organization
JOB_DISCOVERY_REFRESH_TTL_MINUTES=30
```

Each interactive refresh is limited to eight configured boards and 250 jobs per
board. A scheduled admin ingestion job remains preferable for larger catalogs.
