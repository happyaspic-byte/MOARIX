"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="centered-state">
          <div className="brand-mark">M</div>
          <p className="eyebrow">SYSTEM ERROR</p>
          <h1>화면을 불러오지 못했습니다.</h1>
          <p>입력한 데이터는 임의로 처리되지 않았습니다. 잠시 후 다시 시도해 주세요.</p>
          <button className="button primary" onClick={reset}>다시 시도</button>
        </main>
      </body>
    </html>
  );
}
