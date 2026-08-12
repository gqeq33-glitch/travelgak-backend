/**
 * Gemini API 호출 공통 래퍼. 카카오 스킬서버 / 웹챗봇 / 백오피스 AI 매니저가 모두 이 함수를 통해서만
 * Gemini API를 호출한다 (API 키가 서버 밖으로 나가지 않도록 이 파일 하나로 집중시킴).
 */
const { GoogleGenAI } = require('@google/genai');
const { PERSONA_INTRO, buildKnowledgeBaseText } = require('./kb');

const MODEL = 'gemini-2.5-flash';

let client = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
  const ai = getClient();
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];
  const res = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: { systemInstruction: CS_SYSTEM_PROMPT, maxOutputTokens: 500 },
  });
  return res.text;
}

/** 백오피스 AI 매니저(마케팅/정산/콘텐츠)용 범용 생성 함수. */
async function generateBackofficeDraft(systemPrompt, userPrompt) {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: { systemInstruction: systemPrompt, maxOutputTokens: 1200 },
  });
  return res.text;
}

module.exports = { generateCsReply, generateBackofficeDraft, CS_SYSTEM_PROMPT };
