/**
 * 행정안전부 "착한가격업소" 공공데이터 프록시.
 *
 * 데이터셋: 공공데이터포털 "행정안전부_착한가격업소 현황"
 * https://www.data.go.kr/data/3045247/fileData.do
 * 위 페이지에서 회원가입 → OpenAPI 활용신청 후 발급되는 서비스 URL/인증키를 .env의
 * GOOD_PRICE_API_URL / GOOD_PRICE_API_KEY에 그대로 입력하면 실제 데이터로 동작한다.
 * 신청 전에는 정확한 응답 필드명을 확정할 수 없어(공공데이터 API는 기관마다 요청/응답 스펙이
 * 조금씩 다름), 아래 매핑은 data.go.kr에 공개된 컬럼 설명(시도/시군/업종/업소명/연락처/주소/
 * 메뉴1~4/가격1~4, XML→JSON 자동변환 시 흔히 쓰이는 response.body.items.item[] 구조)을
 * 기준으로 작성했다. 실제 신청 후 응답 샘플을 보고 필드명을 다시 맞춰야 할 수 있다.
 *
 * GOOD_PRICE_API_URL이 비어있으면 503을 반환하고, 프론트엔드(index.html)는 이를 감지해
 * 국내 7개 여행지의 목데이터(GOOD_PRICE_STORE_DATA)로 자동 폴백한다.
 *
 * 실제 데이터의 "연락처"는 개인정보 보호를 위해 공란인 경우가 많다(data.go.kr 안내 문구:
 * "연락처 공란 사유: 휴대전화번호 등 개인정보로 제외함") — 프론트는 전화번호가 없으면
 * 지도 링크로 대체 안내한다. 목데이터에도 실존 여부를 확인할 수 없는 전화번호는 절대
 * 임의로 만들어 넣지 않는다(엉뚱한 실제 전화번호와 우연히 겹쳐 피해를 줄 수 있음).
 */
const express = require('express');
const router = express.Router();

// 내부 여행지명 → 착한가격업소 API 조회에 쓰는 시도/시군 (부산·서울처럼 구 단위가 세분화된
// 광역시는 시군을 비워 시도 전체를 조회한 뒤 프론트에서 대표 지역명으로만 안내한다).
const REGION_MAP = {
  '제주': { sido: '제주특별자치도', sigungu: '' },
  '부산': { sido: '부산광역시', sigungu: '' },
  '강릉': { sido: '강원특별자치도', sigungu: '강릉시' },
  '경주': { sido: '경상북도', sigungu: '경주시' },
  '전주': { sido: '전북특별자치도', sigungu: '전주시' },
  '여수': { sido: '전라남도', sigungu: '여수시' },
  '서울': { sido: '서울특별시', sigungu: '' },
};

router.get('/', async (req, res) => {
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: 'city 파라미터가 필요합니다.' });
  const region = REGION_MAP[city];
  if (!region) return res.status(400).json({ error: `지원하지 않는 국내 여행지입니다: ${city}` });

  if (!process.env.GOOD_PRICE_API_URL || !process.env.GOOD_PRICE_API_KEY) {
    return res.status(503).json({
      error: '착한가격업소 공공데이터 API가 아직 설정되지 않았습니다.',
      hint: 'GOOD_PRICE_API_URL / GOOD_PRICE_API_KEY를 .env에 설정하세요 (README 참고, data.go.kr/data/3045247/fileData.do 에서 신청).',
    });
  }

  try {
    const items = await fetchGoodPriceStores(region);
    res.json({ items });
  } catch (err) {
    console.error('[good-price-stores] 조회 실패:', err.message);
    res.status(502).json({ error: '착한가격업소 정보를 불러오지 못했습니다.' });
  }
});

async function fetchGoodPriceStores(region) {
  const params = new URLSearchParams({
    serviceKey: process.env.GOOD_PRICE_API_KEY,
    type: 'json',
    numOfRows: '50',
    pageNo: '1',
    sidoNm: region.sido,
  });
  if (region.sigungu) params.set('sigunguNm', region.sigungu);

  const res = await fetch(`${process.env.GOOD_PRICE_API_URL}?${params}`);
  if (!res.ok) throw new Error(`착한가격업소 API 응답 오류 (${res.status})`);
  const data = await res.json();
  const rawItems = data?.response?.body?.items?.item || data?.items || [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  return list.map((it, idx) => ({
    id: `gp-${region.sido}-${idx}`,
    name: it.upsoNm || it.businessName || it.upso_nm || '',
    category: it.upjongNm || it.category || it.upjong_nm || '',
    address: it.roadAddr || it.address || it.rdnwhlAddr || '',
    phone: it.telNo || it.phone || it.tel_no || null,
    menus: [1, 2, 3, 4]
      .map((n) => ({ name: it[`menu${n}`] || it[`menuNm${n}`], price: it[`price${n}`] || it[`menuPrice${n}`] }))
      .filter((m) => m.name && m.price),
  }));
}

module.exports = router;
