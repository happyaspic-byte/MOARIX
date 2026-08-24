import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Database, LockKeyhole, ScrollText } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/current";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand"><span className="brand-mark">M</span><strong>MOARIX</strong></div>
        <div className="auth-copy">
          <p className="eyebrow">ENTERPRISE OPERATIONS PLATFORM</p>
          <h1>흩어진 업무를<br />하나의 운영 체계로.</h1>
          <p>영업, 구매, 재고, 고객 자산과 서비스 이력을 정확하고 안전하게 연결합니다.</p>
        </div>
        <div className="auth-trust">
          <span><LockKeyhole size={17} />서버 측 권한 검사</span>
          <span><Database size={17} />회사별 데이터 격리</span>
          <span><ScrollText size={17} />변경 이력 추적</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>업무 공간 로그인</h2>
          <p>회사 계정으로 계속하세요.</p>
          <LoginForm nextPath={next ?? "/dashboard"} />
          <div className="auth-security-note"><LockKeyhole size={15} />세션은 암호화된 HttpOnly 쿠키로 보호됩니다.</div>
        </div>
        <p className="auth-footer">© 2026 MOARIX. Authorized use only.</p>
      </section>
    </main>
  );
}
