"use client";
import { useState, useRef, useCallback } from "react";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { resetStaffPassword } from "./staff";

/**
 * مكون تغيير كلمة المرور مع تحقق فوري.
 * يستخدم ref عشان ما يتعارضش مع FormData في Server Actions.
 */
export default function ResetPasswordForm({ userId }: { userId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const check = useCallback(() => {
    const val = inputRef.current?.value ?? "";
    if (val.length === 0) {
      setErrors([]);
      return;
    }
    const fb = validatePassword(val);
    setErrors(fb.valid ? [] : fb.errors);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputRef.current?.value ?? "";
    const fb = validatePassword(val);
    if (!fb.valid) {
      setErrors(fb.errors);
      return;
    }
    setErrors([]);
    setPending(true);
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("password", val);
    await resetStaffPassword(fd);
    setPending(false);
    setDone(true);
    inputRef.current!.value = "";
    setTimeout(() => setDone(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit} className="row" style={{ gap: 6 }}>
      <input
        ref={inputRef}
        name="password"
        type="password"
        placeholder="رقم سري جديد (8 أحرف)"
        minLength={PASSWORD_MIN_LENGTH}
        dir="ltr"
        style={{ width: 150, height: 34 }}
        onBlur={check}
        onChange={check}
      />
      <button className="btn" style={{ height: 34 }} type="submit" disabled={pending}>
        {pending ? "..." : done ? "✓" : "غيّر"}
      </button>
      {errors.length > 0 && (
        <div className="badmsg" style={{ fontSize: 12.5, marginTop: 4 }}>
          {errors.map((err, i) => <div key={i}>{err}</div>)}
        </div>
      )}
    </form>
  );
}
