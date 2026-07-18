// Supabase auth errors surface raw API strings ("Invalid login credentials",
// "over_email_send_rate_limit"…). Map the ones users actually hit to human
// copy; anything unrecognized falls through so real problems stay debuggable.
export function friendlyAuthError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const msg = raw.toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'Wrong email or password. Try again, or use "Forgot password?".';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email first — check your inbox for the confirmation link.';
  }
  if (msg.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('for security purposes, you can only request this after')
  ) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('password should be at least')) {
    return 'That password is too short.';
  }
  if (msg.includes('new password should be different')) {
    return 'Your new password must be different from the old one.';
  }
  if (
    msg.includes('same_password') ||
    msg.includes('should be different from the old password')
  ) {
    return 'Your new password must be different from the old one.';
  }
  if (msg.includes('email address') && msg.includes('invalid')) {
    return 'That email address doesn’t look valid.';
  }
  if (
    msg.includes('network request failed') ||
    msg.includes('aborted') ||
    msg.includes('timeout')
  ) {
    return 'Network trouble — check your connection and try again.';
  }
  return raw;
}
