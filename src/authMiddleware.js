/**
 * Authorization: Bearer <jwt> 헤더를 검증해 req.user에 {id, nickname}을 채운다.
 * 로그인이 필요한 API(마이페이지 저장/조회 등)에서만 사용 — 둘러보기/AI 일정빌더/챗봇은 이 미들웨어를 타지 않는다.
 */
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT_SECRET이 서버에 설정되지 않았습니다.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, nickname: payload.nickname };
    next();
  } catch (err) {
    return res.status(401).json({ error: '로그인이 만료되었거나 유효하지 않습니다.' });
  }
}

module.exports = { requireAuth };
