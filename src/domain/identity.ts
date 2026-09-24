import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AppError } from '../server/errors';
export function normalizeEmail(value: string | null) {
  return value ? value.trim().toLowerCase() : null;
}
export function normalizePhone(value: string | null, country: string) {
  if (!value) return null;
  const phone = parsePhoneNumberFromString(value, { defaultCountry: country as CountryCode, extract: false });
  if (!phone?.isValid() || phone.ext) throw new AppError('INVALID_PHONE', 'Indica un teléfono válido, incluyendo el código de país si corresponde.');
  return phone.number;
}
