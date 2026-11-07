import type { NextConfig } from "next";

// حماية المتصفح: منع تضمين السيستم في مواقع تانية، ومنع تخمين نوع الملفات.
// الكاميرا والموقع مسموحين لموقعنا بس (زرار "📍 مكاني" والمسح بالكاميرا) — الميكروفون مقفول.
const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
  async redirects() {
    // شاشة البيع القديمة اتشالت — الكاشير الجديد بس
    return [{ source: "/pos", destination: "/cashier", permanent: true }];
  },
};

export default nextConfig;
