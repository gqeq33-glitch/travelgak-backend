/**
 * 숙소 실시간 검색 프록시.
 *
 * 실제 서비스 전환 시 Agoda/Booking.com 등 제휴 API를 이 파일에서 호출한다.
 * 현재는 계약된 제공사가 없는 상태라, 요청 형식과 "정규화된 응답 스펙"만 먼저 확정해뒀다.
 * 프론트엔드(index.html)는 이 스펙(id/name/image/pricePerNight/rating/reviews/area/partner/deepLink)만
 * 알면 되므로, 아래 각 제공사 함수 안의 fetch 호출과 응답 매핑만 실제 문서에 맞게 채우면 프론트는
 * 수정할 필요가 없다.
 *
 * HOTEL_API_PROVIDER 환경변수로 사용할 제공사를 선택한다: 'agoda' | 'booking' | 'hotelscombined'
 * 설정돼있지 않으면 503을 반환하고, 프론트엔드는 이를 감지해 로컬 데모 데이터로 자동 폴백한다.
 */
const express = require('express');
const router = express.Router();

const PROVIDER = process.env.HOTEL_API_PROVIDER || '';

router.get('/', async (req, res) => {
  const { dest, checkin, checkout, guests } = req.query;
  if (!dest) return res.status(400).json({ error: 'dest 파라미터가 필요합니다.' });

  if (!PROVIDER) {
    return res.status(503).json({
      error: '숙소 실시간 검색 제공사가 아직 설정되지 않았습니다.',
      hint: 'HOTEL_API_PROVIDER 및 해당 제공사 API 키를 .env에 설정하세요 (README 7번 참고).',
    });
  }

  try {
    let hotels;
    if (PROVIDER === 'agoda') hotels = await searchAgoda({ dest, checkin, checkout, guests });
    else if (PROVIDER === 'booking') hotels = await searchBooking({ dest, checkin, checkout, guests });
    else if (PROVIDER === 'hotelscombined') hotels = await searchHotelsCombined({ dest, checkin, checkout, guests });
    else return res.status(500).json({ error: `알 수 없는 HOTEL_API_PROVIDER: ${PROVIDER}` });
    res.json({ hotels, provider: PROVIDER });
  } catch (err) {
    console.error('[hotels] 검색 실패:', err.message);
    res.status(502).json({ error: '숙소 검색에 실패했습니다.' });
  }
});

/**
 * Agoda Affiliate API 스켈레톤.
 * 실제 사용 전 Agoda Partner Hub(https://partners.agoda.com)에서 SITE_ID/API_KEY를 발급받고,
 * 공식 문서 기준으로 아래 엔드포인트·파라미터·응답 필드명을 반드시 검증/수정할 것
 * (여기 작성된 URL·필드명은 일반적인 호텔 검색 API 형태를 참고한 추정 스켈레톤이며 실제 값이 아님).
 */
async function searchAgoda({ dest, checkin, checkout, guests }) {
  if (!process.env.AGODA_SITE_ID || !process.env.AGODA_API_KEY) {
    throw new Error('AGODA_SITE_ID / AGODA_API_KEY가 설정되지 않았습니다.');
  }
  const params = new URLSearchParams({
    city: dest, checkin: checkin || '', checkout: checkout || '',
    rooms: '1', adults: String(guests || 2),
  });
  const res = await fetch(`https://affiliateapi7643.agoda.com/api/v1/hotels?${params}`, {
    headers: {
      Authorization: `${process.env.AGODA_SITE_ID}:${process.env.AGODA_API_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Agoda API 응답 오류 (${res.status})`);
  const data = await res.json();
  // TODO: 실제 Agoda 응답 구조에 맞춰 필드 매핑 수정 필요
  return (data.hotels || []).map((h) => ({
    id: h.hotelId,
    name: h.hotelName,
    image: h.imageUrl,
    pricePerNight: h.dailyRate,
    rating: h.starRating,
    reviews: h.reviewCount,
    area: h.area,
    partner: '아고다',
    deepLink: h.landingUrl,
  }));
}

/** Booking.com Demand API — 파트너 승인 및 공식 문서 확인 후 구현 필요. */
async function searchBooking() {
  throw new Error('Booking.com 연동 미구현 (Booking.com Partner Hub 문서 확인 후 구현 필요)');
}

/** HotelsCombined / Skyscanner Hotels API — 파트너 승인 및 공식 문서 확인 후 구현 필요. */
async function searchHotelsCombined() {
  throw new Error('HotelsCombined 연동 미구현 (파트너 API 문서 확인 후 구현 필요)');
}

module.exports = router;
