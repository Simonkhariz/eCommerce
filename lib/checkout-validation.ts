/**
 * Delivery details checked before an order is placed, with the same rules as the server, and
 * the server's own 422 answers shown on the same fields.
 */
export type CheckoutField = 'fullName' | 'email' | 'phone' | 'address' | 'city' | 'state';

export type CheckoutFieldErrors = Partial<Record<CheckoutField, string>>;

/** Page order of the fields, so the first problem is the one focused. */
export const CHECKOUT_FIELD_ORDER: CheckoutField[] = ['fullName', 'phone', 'email', 'address', 'state', 'city'];

/** A phone number without the spaces, dashes and brackets people type in it. */
export function cleanPhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

export function validateCheckoutDetails(form: { fullName: string; phone: string; address: string; city: string }): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  if ((form.fullName.match(/\p{L}/gu) ?? []).length < 2) {
    errors.fullName = 'Enter your full name (at least 2 letters).';
  }
  if (!/^(?:0\d{10}|\+?2340?\d{10})$/.test(cleanPhone(form.phone))) {
    errors.phone = 'Enter a Nigerian phone number: 11 digits starting with 0, or +234 and 10 digits.';
  }
  if (form.address.trim().length < 3) {
    errors.address = 'Enter your street address (at least 3 characters).';
  }
  if (form.city.trim().length < 3) {
    errors.city = 'Enter your city or town (at least 3 characters).';
  }
  return errors;
}

/** The first message in a 422 answer's `details` (a message, a list, or a map of either). */
export function firstValidationMessage(details: unknown): string | null {
  if (typeof details === 'string') return details.trim() || null;
  const values = Array.isArray(details) ? details : details && typeof details === 'object' ? Object.values(details) : [];
  for (const value of values) {
    const message = firstValidationMessage(value);
    if (message) return message;
  }
  return null;
}

const SERVER_FIELDS: Record<string, CheckoutField> = {
  full_name: 'fullName',
  name: 'fullName',
  recipient_name: 'fullName',
  email: 'email',
  phone: 'phone',
  address_line1: 'address',
  street_address: 'address',
  address: 'address',
  city: 'city',
  state: 'state',
};

/** A 422 answer's `details` on the checkout form's fields ("shipping_address.phone" or "phone"). */
export function checkoutFieldErrorsFrom(details: unknown): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  if (!details || typeof details !== 'object' || Array.isArray(details)) return errors;
  for (const [key, value] of Object.entries(details)) {
    if (key === 'shipping_address') {
      Object.assign(errors, checkoutFieldErrorsFrom(value));
      continue;
    }
    const field = SERVER_FIELDS[key.split('.').pop() ?? key];
    const message = firstValidationMessage(value);
    if (field && message && !errors[field]) errors[field] = message;
  }
  return errors;
}
