"use client";
import { useState, useRef, useCallback } from "react";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

/**
 * مكون إدخال كلمة المرور مع تحقق فوري.
 * يستخدم ref عشان ما يتعارضش مع FormData في Server Actions.
 */
export default function PasswordInput({ name, label, required }: { name: string; label: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const check = useCallback(() => {
    const val = inputRef.current?.value ?? "";
    if (val.length === 0) {
      setErrors([]);
      return;
    }
    const fb = validatePassword(val);
    setErrors(fb.valid ? [] : fb.errors);
  }, []);

  return (
    <div>
      <label className="fld">
        {label}
        <input
          ref={inputRef}
          name={name}
          type="password"
          dir="ltr"
          required={required}
          minLength={PASSWORD_MIN_LENGTH}
          onBlur={check}
          onChange={check}
        />
      </label>
      {errors.length > 0 && (
        <div className="badmsg" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 6 }}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
