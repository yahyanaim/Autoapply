# billing

Spec section 14 -- Stripe subscriptions and usage-limit enforcement per tier.

Current public plans:

- Free: 3 job-discovery runs, 10 tracked applications, and 50 AI requests per
  month; 1 stored resume and 5 MB storage.
- Pro ($19/month): 50 job-discovery runs, unlimited tracked applications, and
  500 AI requests per month; 5 stored resumes and 25 MB storage.
- Premium ($49/month): unlimited discovery, applications, AI requests, and
  stored resumes, with 2 GB storage.

Checkout validates that the configured Stripe price IDs are active monthly USD
prices matching the public $19 and $49 amounts. Webhook reconciliation derives
the plan from the subscription's actual Stripe price rather than client or
metadata claims.
