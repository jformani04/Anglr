type ValidationResult = {
  valid: boolean;
  message?: string;
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UPPERCASE_REGEX = /[A-Z]/;
export const LOWERCASE_REGEX = /[a-z]/;
export const NUMBER_REGEX = /[0-9]/;
export const SPECIAL_REGEX = /[^A-Za-z0-9]/;

export function sanitizeInput(value: string): string {
  return value.trim();
}

export function validateEmail(email: string): ValidationResult {
  const value = sanitizeInput(email);
  if (!value || !EMAIL_REGEX.test(value)) {
    return { valid: false, message: "Please enter a valid email address." };
  }
  return { valid: true };
}

export function validateLoginPassword(password: string): ValidationResult {
  const value = sanitizeInput(password);
  if (!value || value.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters." };
  }
  return { valid: true };
}

export function validateRegisterPassword(password: string): ValidationResult {
  const value = sanitizeInput(password);
  const strong =
    value.length >= 8 &&
    UPPERCASE_REGEX.test(value) &&
    LOWERCASE_REGEX.test(value) &&
    NUMBER_REGEX.test(value) &&
    SPECIAL_REGEX.test(value);

  if (!strong) {
    return {
      valid: false,
      message:
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
    };
  }

  return { valid: true };
}

export function validateUsername(username: string): ValidationResult {
  const value = sanitizeInput(username);
  if (!value || value.length < 3) {
    return { valid: false, message: "Username must be at least 3 characters." };
  }
  return { valid: true };
}

export function validateConfirmPassword(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (sanitizeInput(password) !== sanitizeInput(confirmPassword)) {
    return { valid: false, message: "Passwords do not match." };
  }
  return { valid: true };
}

export function validatePhone(phone: string): ValidationResult {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return { valid: false, message: "Please enter a valid phone number (e.g. +1 555 123 4567)." };
  }
  return { valid: true };
}

// Converts user input to E.164 format required by Supabase.
// If the number already starts with +, strip non-digits and re-prefix.
// 10-digit numbers without a country code are assumed to be US (+1).
export function normalizePhone(phone: string): string {
  const hasPlus = phone.trimStart().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (hasPlus) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
}

export function mapAuthErrorMessage(errorMessage: string): string {
  const message = errorMessage.toLowerCase();

  if (message.includes("invalid login credentials")) return "Invalid email or password.";
  if (message.includes("email not confirmed")) {
    return "Please confirm your email before logging in.";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "An account with this email already exists.";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("failed to fetch")
  ) {
    return "Network error. Please try again.";
  }

  return errorMessage;
}
