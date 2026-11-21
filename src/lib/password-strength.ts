// Password rule for a new owner account (Create Account): 6 or more characters, anything allowed. The strength meter only
// suggests longer, mixed passwords; it never blocks one that meets the rule.

export const PASSWORD_MIN = 6;

/** The only rule (owner's choice, 2026-11-20): at least 6 characters, any characters allowed. Null when acceptable. */
export function passwordProblem(pw: string): string | null {
  return pw.length < PASSWORD_MIN ? "Password must be at least 6 characters" : null;
}

export type Strength = { level: 0 | 1 | 2 | 3 | 4; label: "" | "Weak" | "Fair" | "Good" | "Strong" };

/** 0 = nothing typed; 1 weak (too short, or only letters or only numbers) … 4 strong (12+ characters mixing cases, numbers and symbols). */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { level: 0, label: "" };
  if (passwordProblem(pw) || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return { level: 1, label: "Weak" };
  let points = 0;
  if (pw.length >= 12) points++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++;
  if (/[^A-Za-z0-9]/.test(pw)) points++;
  if (/^(password|12345678|qwerty|abc123|letmein)/i.test(pw)) points = 0;
  return points >= 2 ? { level: 4, label: "Strong" } : points === 1 ? { level: 3, label: "Good" } : { level: 2, label: "Fair" };
}
