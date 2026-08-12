/**
 * 환불/컴플레인 등 AI가 자동응답하면 안 되는 문의를 걸러내는 에스컬레이션 로직.
 * 매칭되면 AI 응답을 건너뛰고 "상담원 연결" 안내 + 관리자 알림을 보낸다.
 */

const ESCALATION_KEYWORDS = [
  '환불', '취소 수수료', '컴플레인', '불만', '사기', '고소', '법적', '손해배상',
  '분실', '사고', '다쳤', '응급', '항의', '취소해주세요', '취소 해주세요',
  '너무 화가', '책임자', '책임져',
];

function needsEscalation(userMessage) {
  const text = (userMessage || '').toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

const ESCALATION_REPLY =
  '환불/취소나 불편사항처럼 정확한 확인이 필요한 문의는 AI가 바로 답변드리기 어려워요. ' +
  '담당 상담원에게 바로 연결해드릴게요. 잠시만 기다려 주시면 순차적으로 답변드리겠습니다. 🙏';

/**
 * 관리자에게 에스컬레이션 알림을 보낸다.
 * ADMIN_ALERT_WEBHOOK_URL이 설정되어 있으면 Slack Incoming Webhook 포맷으로 POST한다.
 * (Slack이 아닌 다른 서비스를 쓴다면 이 함수의 payload 포맷만 바꿔주면 됨)
 */
async function notifyAdmin({ channel, userId, message }) {
  const webhookUrl = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[escalation] ADMIN_ALERT_WEBHOOK_URL이 설정되지 않아 관리자 알림을 건너뜁니다.');
    return;
  }
  const payload = {
    text: [
      '🚨 *여행각 상담원 전환 요청*',
      `채널: ${channel}`,
      `사용자: ${userId || '알 수 없음'}`,
      `문의 내용: ${message}`,
    ].join('\n'),
  };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[escalation] 관리자 알림 전송 실패:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[escalation] 관리자 알림 전송 중 오류:', err.message);
  }
}

module.exports = { needsEscalation, ESCALATION_REPLY, notifyAdmin };
