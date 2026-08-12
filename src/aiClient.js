/**
 * Claude API 호출 공통 래퍼. 카카오 스킬서버 / 웹챗봇 / 백오피스 AI 매니저가 모두 이 함수를 통해서만
 * Anthropic API를 호출한다 (API 키가 서버 밖으로 나가지 않도록 이 파일 하나로 집중시킴).
 */
const Anthropic = require('@anthropic-ai/sdk');
const { PERSONA_INTRO, buildKnowledgeBaseText } = require('./kb');

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const CS_SYSTEM_PROMPT = `${PERSONA_INTRO}

당신은 여행각(Travel Gak) 여행 플랫폼의 고객 응대 AI 매니저입니다.
말투는 친근하고 간결하게, 이모지는 과하지 않게 1개 내외로 사용하세요.
답변은 2~4문장으로 짧게, 필요하면 목록으로 정리하세요.
확실하지 않은 정보(정확한 항공 시간표, 개별 예약 상태 등)는 지어내지 말고
"정확한 확인이 필요해요"라고 안내한 뒤 상담원 연결을 권하세요.

아래는 여행각의 공식 정보입니다. 이 범위 안에서만 답변하세요:
---
${buildKnowledgeBaseText()}
---`;

/** 고객 문의에 대한 CS 답변을 생성한다. */
async function generateCsReply(userMessage, history = []) {
  const anthropic = getClient();
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    system: CS_SYSTEM_PROMPT,
    messages,
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

/** 백오피스 AI 매니저(마케팅/정산/콘텐츠)용 범용 생성 함수. */
async function generateBackofficeDraft(systemPrompt, userPrompt) {
  const anthropic = getClient();
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

module.exports = { generateCsReply, generateBackofficeDraft, CS_SYSTEM_PROMPT };
