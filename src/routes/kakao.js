/**
 * 카카오톡 채널 챗봇(카카오 i 오픈빌더) 스킬 서버 웹훅.
 *
 * 오픈빌더 설정 방법:
 * 1) https://i.kakao.com 오픈빌더에서 챗봇 생성 → 카카오톡 채널과 연결
 * 2) "스킬" 메뉴에서 새 스킬 추가, URL에 이 서버의 https://<배포주소>/kakao/webhook 등록
 * 3) 폴백 블록(어떤 발화에도 안 걸릴 때) 또는 특정 블록에 이 스킬을 연결
 * 4) 오픈빌더에서 "배포"까지 눌러야 실제 채널에 반영됨
 *
 * 카카오는 스킬 서버가 5초 안에 응답하지 못하면 타임아웃 처리하므로,
 * Claude 응답이 느릴 경우를 대비해 아래에서 timeout을 걸어둔다.
 */
const express = require('express');
const { generateCsReply } = require('../aiClient');
const { needsEscalation, ESCALATION_REPLY, notifyAdmin } = require('../escalation');

const router = express.Router();

function kakaoSimpleText(text) {
  return {
    version: '2.0',
    template: { outputs: [{ simpleText: { text } }] },
  };
}

router.post('/webhook', async (req, res) => {
  // 선택: 오픈빌더가 아닌 곳에서의 요청을 걸러내고 싶으면 KAKAO_SKILL_SECRET을
  // 커스텀 헤더나 쿼리로 검증하는 로직을 여기에 추가한다.

  const utterance = req.body?.userRequest?.utterance || '';
  const userId = req.body?.userRequest?.user?.id || 'unknown';

  if (!utterance.trim()) {
    return res.json(kakaoSimpleText('메시지를 이해하지 못했어요. 다시 말씀해 주시겠어요?'));
  }

  if (needsEscalation(utterance)) {
    await notifyAdmin({ channel: 'kakao', userId, message: utterance });
    return res.json(kakaoSimpleText(ESCALATION_REPLY));
  }

  try {
    // 카카오 스킬 서버는 5초 타임아웃이 있으므로 4.5초로 안전 마진을 둔다.
    const reply = await withTimeout(generateCsReply(utterance), 4500);
    return res.json(kakaoSimpleText(reply));
  } catch (err) {
    console.error('[kakao webhook] AI 응답 생성 실패:', err.message);
    // 실패 시에도 상담원 연결 문구로 안전하게 대체 (에러를 사용자에게 그대로 노출하지 않음)
    await notifyAdmin({ channel: 'kakao', userId, message: `[AI 오류로 인한 자동 에스컬레이션] ${utterance}` });
    return res.json(kakaoSimpleText(ESCALATION_REPLY));
  }
});

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

module.exports = router;
