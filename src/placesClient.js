/**
 * Google Places API(New) Text Search 래퍼. 맛집/관광지 실시간 평점·주소·지도링크를 조회한다.
 * GOOGLE_PLACES_API_KEY가 없으면 호출하지 않고 빈 배열을 반환한다 — 이 경우 aiClient가
 * "확인 필요"로 답하도록 프롬프트에서 처리하므로, 이 파일은 실패를 조용히 삼켜도 안전하다.
 */
async function searchPlaces(query, maxResults = 3) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !query) return [];

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
