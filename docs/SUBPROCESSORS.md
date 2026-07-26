# ApplyAI sub-processor register

This is the engineering inventory used to prepare DPAs and the public
sub-processor notice. The production owner must verify contracts, regions,
retention, and transfer mechanisms before enabling a provider.

| Provider | Purpose | Data categories | Enabled when |
|---|---|---|---|
| Amazon Web Services | Compute, database, encrypted object storage, backups | Account, resume, application, operational data | Production infrastructure |
| Stripe | Checkout, subscriptions, invoices, payment status | Account email, customer/subscription/payment metadata | Stripe configuration is present |
| OpenAI | User-requested AI generation/normalization | Minimum resume/job/prompt content for the request | Selected or fallback provider |
| Anthropic | User-requested AI generation/normalization | Minimum resume/job/prompt content for the request | Selected or fallback provider |
| Google AI | User-requested AI generation/normalization | Minimum resume/job/prompt content for the request | Selected or fallback provider |
| Configured SMTP operator | Transactional notifications | Email address and notification content | SMTP configuration is present |

ApplyAI does not sell personal data. Provider keys left blank keep that provider
disabled. The release owner must update this file and the public privacy notice
before adding a new processor.
