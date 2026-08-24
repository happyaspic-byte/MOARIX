import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered-state">
      <div className="brand-mark">M</div>
      <p className="eyebrow">404</p>
      <h1>요청한 화면을 찾을 수 없습니다.</h1>
      <p>주소를 확인하거나 업무 홈으로 돌아가세요.</p>
      <Link className="button primary" href="/dashboard">업무 홈으로</Link>
    </main>
  );
}
