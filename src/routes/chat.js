/**
 * 웹사이트 플로팅 챗봇 / AI 컨설턴트 섹션용 API.
 * 카카오 웹훅과 동일한 knowledge base·escalation 로직을 공유해서 답변 일관성을 유지한다.
 */
const express = require('express');
const { generateCsReply } = require('../aiClient');
const { needsEscalation, ESCALATION_REPLY, notifyAdmin } = require('../escalation');
const { buildBookingCards } = require('../kb');

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: '메시지가 비어있습니다.' });
  }

  if (needsEscalation(message)) {
    await notifyAdmin({ channel: 'web', userId: req.ip, message });
    return res.json({ reply: ESCALATION_REPLY, escalated: true, cards: [] });
  }

  try {
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const reply = await generateCsReply(message, safeHistory);
    return res.json({ reply, escalated: false, cards: buildBookingCards(message, reply) });
  } catch (err) {
    console.error('[chat] AI 응답 생성 실패:', err.message);
    return res.status(500).json({ error: 'AI 응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

module.exports = router;
