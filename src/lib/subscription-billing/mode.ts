/**
 * Payments switch on by themselves once PayU keys are in the environment.
 *
 * Until then (early access / testing):
 * - changing seats is free and takes effect immediately, with no checkout;
 * - an ended trial doesn't block invites.
 * Seat limits are still enforced either way.
 */
export function paymentsEnabled() {
  return Boolean(process.env.PAYU_KEY && process.env.PAYU_SALT);
}
