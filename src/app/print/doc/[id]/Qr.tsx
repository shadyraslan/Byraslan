"use client";
import { QRCodeSVG } from "qrcode.react";
export default function Qr({ value }: { value: string }) {
  return <QRCodeSVG value={value} size={96} level="M" />;
}
