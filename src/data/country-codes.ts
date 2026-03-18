export interface CountryCode {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: "BR", dial: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "PT", dial: "+351", flag: "🇵🇹", name: "Portugal" },
  { code: "AR", dial: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "UY", dial: "+598", flag: "🇺🇾", name: "Uruguai" },
  { code: "PY", dial: "+595", flag: "🇵🇾", name: "Paraguai" },
  { code: "CL", dial: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "CO", dial: "+57", flag: "🇨🇴", name: "Colômbia" },
  { code: "MX", dial: "+52", flag: "🇲🇽", name: "México" },
  { code: "PE", dial: "+51", flag: "🇵🇪", name: "Peru" },
  { code: "BO", dial: "+591", flag: "🇧🇴", name: "Bolívia" },
  { code: "EC", dial: "+593", flag: "🇪🇨", name: "Equador" },
  { code: "VE", dial: "+58", flag: "🇻🇪", name: "Venezuela" },
  { code: "ES", dial: "+34", flag: "🇪🇸", name: "Espanha" },
  { code: "FR", dial: "+33", flag: "🇫🇷", name: "França" },
  { code: "DE", dial: "+49", flag: "🇩🇪", name: "Alemanha" },
  { code: "IT", dial: "+39", flag: "🇮🇹", name: "Itália" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "Reino Unido" },
  { code: "JP", dial: "+81", flag: "🇯🇵", name: "Japão" },
  { code: "CN", dial: "+86", flag: "🇨🇳", name: "China" },
  { code: "IN", dial: "+91", flag: "🇮🇳", name: "Índia" },
  { code: "AO", dial: "+244", flag: "🇦🇴", name: "Angola" },
  { code: "MZ", dial: "+258", flag: "🇲🇿", name: "Moçambique" },
];

/**
 * Format a raw phone number (digits only) as WhatsApp display format: +55 XX XXXXX-XXXX
 */
export function formatPhoneWhatsApp(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  
  // Brazilian number: 55 + 2 DDD + 8-9 digits
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    if (number.length === 9) {
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    if (number.length === 8) {
      return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
    }
  }
  
  // Try to match any known country code
  for (const c of COUNTRY_CODES) {
    const dialDigits = c.dial.replace(/\D/g, "");
    if (digits.startsWith(dialDigits) && digits.length > dialDigits.length + 4) {
      const rest = digits.slice(dialDigits.length);
      return `${c.dial} ${rest}`;
    }
  }
  
  // Fallback: assume Brazilian without country code
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  
  return phone;
}

/**
 * Format phone for editing: (XX) XXXXX-XXXX (without country code)
 */
export function formatPhoneEdit(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  
  // Remove country code if present
  let local = digits;
  if (digits.startsWith("55") && digits.length >= 12) {
    local = digits.slice(2);
  }
  
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  
  return local;
}

/**
 * Extract country dial code from a phone number
 */
export function detectCountryCode(phone: string | null | undefined): string {
  if (!phone) return "+55";
  const digits = phone.replace(/\D/g, "");
  for (const c of COUNTRY_CODES) {
    const dialDigits = c.dial.replace(/\D/g, "");
    if (digits.startsWith(dialDigits)) return c.dial;
  }
  return "+55";
}

/**
 * Mask input as (XX) XXXXX-XXXX
 */
export function maskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}
