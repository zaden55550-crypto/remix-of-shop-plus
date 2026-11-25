// Who DataQuill Solutions' emails come from (owner, 2026-11-25): info@dataquillsolutions.com, unless the server sets INVITE_EMAIL_FROM.
// Only RESEND_API_KEY must be saved in Lovable Cloud; the dataquillsolutions.com domain must be verified in Resend.
export const DEFAULT_SENDER = "DataQuill Solutions <info@dataquillsolutions.com>";
export const senderFrom = (value: string | undefined) => (value && value.trim()) || DEFAULT_SENDER;
