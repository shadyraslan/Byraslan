/**
 * سياسات كلمات المرور — التحقق من قوة كلمة المرور.
 * الحد الأدنى: 8 أحرف مع حرف كبير، حرف صغير، ورقم.
 */

const MIN_LENGTH = 8;

export interface PasswordFeedback {
  valid: boolean;
  errors: string[];
}

/**
 * التحقق من قوة كلمة المرور
 * الرسائل مطابقة للمواصفات المطلوبة.
 */
export function validatePassword(password: string): PasswordFeedback {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push("كلمة المرور يجب ألا تقل عن 8 أحرف.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("يجب أن تحتوي كلمة المرور على حرف إنجليزي كبير واحد على الأقل.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("يجب أن تحتوي كلمة المرور على حرف إنجليزي صغير واحد على الأقل.");
  }

  if (!/\d/.test(password)) {
    errors.push("يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * التحقق السريع — هل كلمة المرور صالحة؟
 */
export function isPasswordValid(password: string): boolean {
  return validatePassword(password).valid;
}

/**
 * الحد الأدنى لطول كلمة المرور
 */
export const PASSWORD_MIN_LENGTH = MIN_LENGTH;
