export const KINDS: Record<string, { label: string; ic: string }> = {
  safe: { label: "خزنة كاش", ic: "🗄️" },
  bank: { label: "حساب بنك", ic: "🏦" },
  wallet: { label: "محفظة (فودافون كاش وغيرها)", ic: "📱" },
  instapay: { label: "إنستاباي", ic: "⚡" },
  pos: { label: "ماكينة فيزا", ic: "💳" },
  gateway: { label: "بوابة دفع (Paymob / فوري…)", ic: "🌐" },
  other: { label: "حاجة تانية", ic: "💼" },
};
