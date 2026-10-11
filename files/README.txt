두쫀쿠 — Netlify 배포 방법

폴더 구조 (그대로 GitHub에 올리세요)
  netlify.toml
  package.json
  public/index.html
  netlify/functions/api.mjs

Netlify 설정값 (netlify.toml 이 자동으로 채워줘요)
  Build command      : (비워 둠)
  Publish directory  : public
  Functions directory: netlify/functions

배포 확인: https://내사이트주소/api/time  → {"t":1234...} 가 보이면 서버 함수 성공
  → 출석이 서버 시간으로 검사되고, 🏆 랭킹 / 👥 친구 탭이 켜집니다.
