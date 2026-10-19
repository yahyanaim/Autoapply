/** Nori-only limits; independent of product AI quotas and provider billing. */
export const CAREER_CHAT_MESSAGE_CHARACTERS = 2_000;
export const CAREER_CHAT_CONVERSATION_CHARACTERS = 8_000;
export const CAREER_CHAT_DEFAULT_OUTPUT_TOKENS = 700;

// Framed policy/context (~3.3 KB) + a full 2,000-character ordinary Unicode
// question (up to 6 KB) + output reservation + greeting/framing headroom.
// This is a conservative local allowance, not the model's context window.
export const CAREER_CHAT_DEFAULT_REQUEST_UNITS = 12_000;
