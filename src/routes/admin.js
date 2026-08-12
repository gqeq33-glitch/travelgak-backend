/**
 * 백오피스 "AI 매니저" 3종 API — 마케팅 / 파트너·수수료 정산 / 콘텐츠.
 * 간단한 비밀번호 헤더 인증만 적용되어 있음 (실서비스 전환 시 세션/JWT + 관리자 계정 시스템으로 교체 권장).
 */
const express = require('express');
const { generateBackofficeDraft } = require('../aiClient');

const router = express.Router();

function requireAdminAuth(req, res, next) {
  const provided = req.header('x-admin-password');
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD가 서버에 설정되지 않았습니다.' });
  }
  if (provided !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '인증에 실패했습니다.' });
  }
  next();
}
router.use(requireAdminAuth);

// ── 1) 마케팅 AI 매니저: 인스타 공구 카드 홍보문구 / 캡션 생성 ──────────────
router.post('/marketing-copy', async (req, res) => {
  const { productName, destination, price, discount, tone } = req.body || {};
  if (!productName) return res.status(400).json({ error: 'productName은 필수입니다.' });

  const system = `당신은 여행 스타트업 "여행각"의 SNS 마케팅 카피라이터입니다.
인스타그램 공구 카드용 짧은 홍보 문구 1개와, 인스타/블로그용 캡션 1개(해시태그 5개 포함)를 작성하세요.
톤앤매너: ${tone || '트렌디하고 친근한 20~30대 타겟 말투'}. 과장 광고성 표현(무조건, 100% 등)은 피하세요.
출력 형식은 반드시 아래 마크다운 형식을 따르세요:

### 홍보 문구
(한 줄)

### 캡션
(2~4문장)

### 해시태그
#태그1 #태그2 #태그3 #태그4 #태그5`;

  const user = `상품명: ${productName}\n여행지: ${destination || '미지정'}\n가격: ${price || '미지정'}\n할인율: ${discount || '미지정'}`;

  try {
    const draft = await generateBackofficeDraft(system, user);
    res.json({ draft });
  } catch (err) {
    console.error('[admin/marketing-copy]', err.message);
    res.status(500).json({ error: 'AI 생성에 실패했습니다.' });
  }
});

// ── 2) 파트너/수수료 AI 매니저: 정산 요약 및 정산서 초안 ──────────────────
router.post('/settlement', async (req, res) => {
  const { partnerName, period, leadCount, unitCommission, notes } = req.body || {};
  if (!partnerName || !leadCount) {
    return res.status(400).json({ error: 'partnerName, leadCount는 필수입니다.' });
  }

  const total = Number(leadCount) * Number(unitCommission || 0);
  const system = `당신은 여행사 "여행각"의 파트너 정산 담당 AI 매니저입니다.
네이버 밴드/제휴 여행사에서 발생한 리드(문의·예약 연결) 건수를 바탕으로
정산 요약과, 파트너사에 그대로 보낼 수 있는 정산서 초안(표 형태 텍스트)을 작성하세요.
숫자는 반드시 입력값을 그대로 사용하고 임의로 추정하지 마세요.`;

  const user = [
    `파트너사: ${partnerName}`,
    `정산 기간: ${period || '미지정'}`,
    `리드(건수): ${leadCount}건`,
    `건당 수수료: ${unitCommission || 0}원`,
    `합계: ${total.toLocaleString('ko-KR')}원`,
    notes ? `비고: ${notes}` : '',
  ].filter(Boolean).join('\n');

  try {
    const draft = await generateBackofficeDraft(system, user);
    res.json({ draft, total });
  } catch (err) {
    console.error('[admin/settlement]', err.message);
    res.status(500).json({ error: 'AI 생성에 실패했습니다.' });
  }
});

// ── 3) 콘텐츠 AI 매니저: 여행 매거진 팁글 / 추천 코스 드래프트 ─────────────
router.post('/content-draft', async (req, res) => {
  const { topic, destination, style } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic은 필수입니다.' });

  const system = `당신은 여행 매거진 "여행각 매거진"의 콘텐츠 작가 AI입니다.
요청받은 주제로 블로그 팁글 또는 추천 코스 가이드 초안을 작성하세요.
구조: 도입부(2문장) → 소제목 3~4개 각각 2~3문장 → 마무리 한 줄 요약.
실제로 확인이 필요한 구체적 수치(영업시간, 가격)는 "확인 필요"로 표시하고 지어내지 마세요.`;

  const user = `주제: ${topic}\n여행지: ${destination || '미지정'}\n스타일: ${style || '가볍고 실용적인 정보성 글'}`;

  try {
    const draft = await generateBackofficeDraft(system, user);
    res.json({ draft });
  } catch (err) {
    console.error('[admin/content-draft]', err.message);
    res.status(500).json({ error: 'AI 생성에 실패했습니다.' });
  }
});

module.exports = router;
