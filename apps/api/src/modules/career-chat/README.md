# Independent Morocco career assistant

This module powers Nori, the floating Morocco career chatbot. It is deliberately
isolated from `modules/ai`.

## Isolation contract

- Uses only `DAHL_CAREER_CHAT_*` configuration.
- Does not import `AIModule`, `AIService`, `AIProviderFactory`, or CV/application
  prompts.
- Does not reserve or consume `UsageLimit.aiRequestsUsed`.
- Has its own user-aware/IP-aware request throttle.
- Does not receive resume, profile, application, or account data.
- Conversation messages are sent for the current response and are not persisted.

## Endpoint

```text
POST /career-chat/messages
```

The request contains between 1 and 12 bounded `user`/`assistant` messages and
must end with a user question.

## Provider

Dahl exposes an OpenAI-compatible chat-completions endpoint:

```text
https://inference.dahl.global/v1/chat/completions
```

The API key is read only on the backend. Never use a `NEXT_PUBLIC_*` or `VITE_*`
variable for it.

## Trusted context

The assistant receives:

- a small set of official Morocco career-resource URLs;
- at most six recently indexed, public, Morocco-located ApplyAI jobs;
- no private or user-captured jobs.

Only allow-listed sources actually cited by the model are returned as clickable
links to the dashboard.

## Limits

- 20 requests per hour per verified user ID or trusted-proxy-aware IP.
- 12 messages per request.
- 2,000 characters per message.
- 8,000 total conversation characters.
- 700 output tokens by default.
- 30-second provider timeout by default.
