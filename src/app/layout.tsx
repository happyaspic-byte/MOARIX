import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MOARIX ERP",
    template: "%s | MOARIX",
  },
  description: "영업·구매·재고·자산·서비스를 하나로 연결하는 기업 운영 플랫폼",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
