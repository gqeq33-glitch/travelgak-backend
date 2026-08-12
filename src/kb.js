/**
 * 여행각(Travel Gak) 공유 지식베이스(KB).
 * 카카오톡 AI 매니저와 웹사이트 챗봇이 동일한 답변 근거를 쓰도록 이 파일 하나로 관리한다.
 * 실제 서비스 확장 시에는 이 값들을 DB/CMS로 옮기고, 여기서는 조회만 하도록 바꾸면 된다.
 */

const PERSONA_INTRO = '안녕하세요! 여행각 AI 매니저입니다 ✈️';

const COMPANY = {
  name: '여행각(Travel Gak)',
  feePolicy: '여행각 이용 수수료는 0원입니다. 각 항목(항공/호텔/렌터카/투어)은 실제 제휴사(아고다, 부킹닷컴, Skyscanner, Klook, 마이리얼트립, 네이버여행 등) 페이지에서 직접 결제하며, 여행각은 최저가 비교와 일정 구성만 도와드립니다.',
  bookingFlow: [
    '1) 사이트에서 여행지·항공·숙소·렌터카·투어를 원하는 조합으로 선택',
    '2) "이 일정으로 예약 진행하기" 클릭',
    '3) 각 항목별로 실제 제휴사 페이지로 이동해 항목별 결제 진행',
    '4) 최종 결제 금액/취소·환불 규정은 각 제휴사 정책을 따름 (여행각은 결제를 대행하지 않음)',
  ],
  igDeals: '인스타 호텔공구는 매주 갱신되며, 마감 시각은 매주 일요일 24:00(한국시간) 기준입니다. 마감 전 "찜하기"로 미리 담아두시는 걸 추천드려요.',
};

const DESTINATIONS = [
  '다낭', '오사카', '방콕', '제주', '파리', '도쿄', '후쿠오카', '타이베이', '홍콩', '발리',
  '싱가포르', '세부', '코타키나발루', '런던', '로마', '프라하', '뉴욕', '하와이', '로스앤젤레스', '시드니',
];

const FAQ = [
  { q: '수수료가 있나요?', a: COMPANY.feePolicy },
  { q: '예약은 어떻게 하나요?', a: COMPANY.bookingFlow.join('\n') },
  { q: '환불/취소는 어떻게 하나요?', a: '결제는 각 제휴사에서 직접 이루어지기 때문에 환불·취소 규정도 해당 제휴사 정책을 따릅니다. 정확한 취소 수수료나 환불 가능 여부는 예약하신 제휴사(아고다/부킹닷컴 등) 예약내역에서 확인하시거나, 상담원 연결을 요청해 주세요.' },
  { q: '인스타 공구는 언제 마감되나요?', a: COMPANY.igDeals },
  { q: '추천 여행지가 궁금해요', a: `현재 여행각에서 비교 가능한 여행지는 ${DESTINATIONS.join(', ')} 입니다. "오늘의 여행각 뽑기"로 랜덤 추천도 받아보실 수 있어요.` },
];

/** AI 시스템 프롬프트에 주입할 지식베이스 텍스트를 만든다. */
function buildKnowledgeBaseText() {
  return [
    `${COMPANY.name} 안내 정보:`,
    `- 수수료 정책: ${COMPANY.feePolicy}`,
    `- 예약 절차: ${COMPANY.bookingFlow.join(' / ')}`,
    `- 인스타 공구: ${COMPANY.igDeals}`,
    `- 비교 가능 여행지: ${DESTINATIONS.join(', ')}`,
    '',
    '자주 묻는 질문(FAQ):',
    ...FAQ.map((f) => `Q. ${f.q}\nA. ${f.a}`),
  ].join('\n');
}

/** 사용자 메시지 + AI 답변에서 여행지와 "숙소/투어" 키워드를 감지해 제휴 예약 카드를 붙인다.
 *  index.html의 buildChatBookingCards()와 동일한 로직 — 프론트 데모 모드와 실제 백엔드 응답이
 *  같은 기준으로 카드를 붙이도록 두 곳에 나란히 유지한다. */
function buildBookingCards(message, replyText) {
  const text = `${message} ${replyText}`;
  const dest = DESTINATIONS.find((d) => text.includes(d));
  if (!dest) return [];
  const cards = [];
  if (text.includes('숙소') || text.includes('호텔')) {
    cards.push({ kind: 'hotel', partner: '아고다', label: `🏨 ${dest} 추천 숙소 예약하기 (아고다)` });
  }
  if (text.includes('투어') || text.includes('액티비티') || text.includes('체험')) {
    cards.push({ kind: 'tour', partner: '마이리얼트립', label: `🎫 ${dest} 투어 예약하기 (마이리얼트립)` });
  }
  return cards.slice(0, 2);
}

module.exports = { PERSONA_INTRO, COMPANY, DESTINATIONS, FAQ, buildKnowledgeBaseText, buildBookingCards };
