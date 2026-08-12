/**
 * 외교부 해외안전여행(공공데이터포털) 여행경보 정보 캐시 갱신.
 *
 * 공공데이터포털에서 "외교부_여행경보제도" API 활용신청(https://www.data.go.kr/data/15000827/openapi.do)을
 * 하면 인증키와 함께 정확한 서비스 URL(Swagger 문서 기준)이 발급된다 — 여기서는 그 값을 그대로
 * MOFA_API_URL에 넣어 쓰는 구조로 만들어뒀다(엔드포인트를 하드코딩하지 않은 이유: 신청 전에는
 * 정확한 경로를 확정할 수 없고, 잘못된 경로를 하드코딩하는 것보다 이 편이 더 정직하다).
 *
 * 여행경보는 4단계(여행유의/여행자제/출국권고/여행금지)로 제공된다.
 * MOFA_API_URL / MOFA_API_KEY가 없으면 조용히 건너뛰고, index.html의 DEST_QUICK_INFO 정적 값이
 * 계속 쓰인다 — 이 캐시는 "있으면 더 정확해지는" 보강 데이터이지, 필수 의존성이 아니다.
 */
const { upsertDestMofaCache } = require('./db');

async function refreshMofaSafetyCache(destinations) {
  if (!process.env.MOFA_API_URL || !process.env.MOFA_API_KEY) {
    console.warn('[mofaSafety] MOFA_API_URL/MOFA_API_KEY가 없어 외교부 안전정보 갱신을 건너뜁니다.');
    return;
  }
  for (const dest of destinations) {
    try {
      const params = new URLSearchParams({
        serviceKey: process.env.MOFA_API_KEY,
        returnType: 'JSON',
        countryName: dest,
      });
      const res = await fetch(`${process.env.MOFA_API_URL}?${params}`);
      if (!res.ok) throw new Error(`외교부 API 응답 오류 (${res.status})`);
      const data = await res.json();
      upsertDestMofaCache(dest, data);
    } catch (e) {
      console.error(`[mofaSafety] ${dest} 갱신 실패:`, e.message);
    }
  }
}

module.exports = { refreshMofaSafetyCache };
