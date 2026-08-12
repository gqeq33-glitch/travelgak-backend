/**
 * Google Places API(New) Text Search 래퍼. 맛집/관광지 실시간 평점·주소·지도링크를 조회한다.
 * GOOGLE_PLACES_API_KEY가 없으면 호출하지 않고 빈 배열을 반환한다 — 이 경우 aiClient가
 * "확인 필요"로 답하도록 프롬프트에서 처리하므로, 이 파일은 실패를 조용히 삼켜도 안전하다.
 *
 * Google 무료 한도(Text Search Pro 기준 월 5,000건)를 넘기지 않도록, 이번 달 호출 수를 세어
 * 안전 버퍼를 둔 상한(기본 4,500건)에 도달하면 호출을 건너뛴다. 이 카운터는 DB 파일(data.sqlite)에
 * 저장되므로 서버 재시작에는 살아남지만, Render 무료 플랜에서 디스크가 초기화되는 경우(재배포 등)엔
 * 리셋될 수 있다 — 100% 확실한 상한선이 필요하면 Google Cloud Console에서 API 자체 할당량(Quota)도
 * 함께 설정하는 걸 권장한다 (README 참고).
 */
const { incrementApiUsage } = require('./db');

const MONTHLY_SAFE_CAP = Number(process.env.GOOGLE_PLACES_MONTHLY_CAP) || 4500;

async function searchPlaces(query, maxResults = 3) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !query) return [];

  const counterKey = `places_api:${new Date().toISOString().slice(0, 7)}`;
  const usedThisMonth = incrementApiUsage(counterKey);
  if (usedThisMonth > MONTHLY_SAFE_CAP) {
    console.warn(`[places] 이번 달 호출 ${usedThisMonth}건 — 안전 한도(${MONTHLY_SAFE_CAP}건) 초과로 호출 건너뜀`);
    return [];
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.displayName',
          'places.rating',
          'places.userRatingCount',
          'places.formattedAddress',
          'places.googleMapsUri',
          'places.priceLevel',
        ].join(','),
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'ko' }),
    });

    if (!res.ok) {
      console.error('[places] 검색 실패:', res.status, await res.text());
      return [];
    }

    const data = await res.json();
    return (data.places || []).slice(0, maxResults).map((p) => {
      const name = p.displayName?.text || query;
      return {
        name,
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        address: p.formattedAddress ?? null,
        mapsUri: p.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
        priceLevel: p.priceLevel ?? null,
      };
    });
  } catch (err) {
    console.error('[places] 조회 실패:', err.message);
    return [];
  }
}

module.exports = { searchPlaces };
