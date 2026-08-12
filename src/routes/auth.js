/**
 * 네이버/카카오 소셜 로그인 (지연 로그인 패턴).
 *
 * 흐름: 프론트엔드가 팝업 창으로 /auth/:provider/login을 연다
 *   → 이 서버가 네이버/카카오 인증 페이지로 리다이렉트
 *   → 사용자가 동의하면 /auth/:provider/callback으로 돌아옴
 *   → 이 서버가 토큰 교환 + 프로필 조회 + 유저 upsert + JWT 발급
 *   → 팝업 창에 "로그인 성공" HTML을 응답하고, 그 안에서 window.opener로 postMessage 후 스스로 닫힘
 *   → 프론트엔드(index.html)가 메시지를 받아 로그인 상태로 전환하고 팝업을 띄운 액션을 이어서 실행
 *
 * state 값은 CSRF 방지용으로, 이 프로세스의 메모리에만 저장한다(서버 재시작/다중 인스턴스 배포 시
 * 유실될 수 있음 — 여러 대의 서버로 스케일할 계획이면 Redis 등 공유 저장소로 교체할 것).
 */
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { upsertUser } = require('../db');

const router = express.Router();

const pendingStates = new Map(); // state -> createdAt(ms)
const STATE_TTL_MS = 5 * 60 * 1000;
function issueState() {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());
  return state;
}
function consumeState(state) {
  const createdAt = pendingStates.get(state);
  pendingStates.delete(state);
  return !!createdAt && Date.now() - createdAt < STATE_TTL_MS;
}

function backendUrl(req) {
  return process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

function signJwt(user) {
  return jwt.sign({ sub: user.id, nickname: user.nickname }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

/** 팝업에서 opener로 로그인 결과를 postMessage하고 스스로 닫는 HTML을 응답한다. */
function respondWithPopupSuccess(res, req, user, token) {
  const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
  const payload = JSON.stringify({
    type: 'yeohaenggak-auth-success',
    token,
    user: { id: user.id, nickname: user.nickname },
  });
  res.send(`<!doctype html><html><body>
    <script>
      if (window.opener) {
        window.opener.postMessage(${payload}, ${JSON.stringify(frontendOrigin)});
        window.close();
      } else {
        document.body.textContent = '로그인이 완료되었습니다. 이 창을 닫아주세요.';
      }
    </script>
  </body></html>`);
}

function respondWithPopupError(res, message) {
  res.status(400).send(`<!doctype html><html><body>
    <p>${message}</p>
    <script>setTimeout(function(){ window.close(); }, 3000);</script>
  </body></html>`);
}

// ── 네이버 로그인 ──────────────────────────────────────────────
router.get('/naver/login', (req, res) => {
  if (!process.env.NAVER_LOGIN_CLIENT_ID) {
    return respondWithPopupError(res, '네이버 로그인이 아직 설정되지 않았습니다 (NAVER_LOGIN_CLIENT_ID 필요).');
  }
  const state = issueState();
  const redirectUri = `${backendUrl(req)}/auth/naver/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NAVER_LOGIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
  });
  res.redirect(`https://nid.naver.com/oauth2.0/authorize?${params}`);
});

router.get('/naver/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return respondWithPopupError(res, '네이버 로그인이 취소되었습니다.');
  if (!code || !state || !consumeState(state)) return respondWithPopupError(res, '로그인 요청이 유효하지 않습니다. 다시 시도해주세요.');

  try {
    const redirectUri = `${backendUrl(req)}/auth/naver/callback`;
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.NAVER_LOGIN_CLIENT_ID,
      client_secret: process.env.NAVER_LOGIN_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      state,
    });
    const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${tokenParams}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('네이버 토큰 발급 실패');

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();
    const p = profileData.response;
    if (!p || !p.id) throw new Error('네이버 프로필 조회 실패');

    const user = upsertUser({
      provider: 'naver',
      providerUserId: p.id,
      nickname: p.nickname || p.name || '네이버 사용자',
      email: p.email,
    });
    const token = signJwt(user);
    respondWithPopupSuccess(res, req, user, token);
  } catch (err) {
    console.error('[auth/naver] 로그인 실패:', err.message);
    respondWithPopupError(res, '네이버 로그인 중 오류가 발생했습니다.');
  }
});

// ── 카카오 로그인 ──────────────────────────────────────────────
router.get('/kakao/login', (req, res) => {
  if (!process.env.KAKAO_LOGIN_CLIENT_ID) {
    return respondWithPopupError(res, '카카오 로그인이 아직 설정되지 않았습니다 (KAKAO_LOGIN_CLIENT_ID 필요).');
  }
  const state = issueState();
  const redirectUri = `${backendUrl(req)}/auth/kakao/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.KAKAO_LOGIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
  });
  res.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
});

router.get('/kakao/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return respondWithPopupError(res, '카카오 로그인이 취소되었습니다.');
  if (!code || !state || !consumeState(state)) return respondWithPopupError(res, '로그인 요청이 유효하지 않습니다. 다시 시도해주세요.');

  try {
    const redirectUri = `${backendUrl(req)}/auth/kakao/callback`;
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.KAKAO_LOGIN_CLIENT_ID,
      redirect_uri: redirectUri,
      code,
    });
    if (process.env.KAKAO_LOGIN_CLIENT_SECRET) tokenParams.set('client_secret', process.env.KAKAO_LOGIN_CLIENT_SECRET);
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('카카오 토큰 발급 실패');

    const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();
    if (!profileData.id) throw new Error('카카오 프로필 조회 실패');
    const account = profileData.kakao_account || {};

    const user = upsertUser({
      provider: 'kakao',
      providerUserId: String(profileData.id),
      nickname: (account.profile && account.profile.nickname) || '카카오 사용자',
      email: account.email,
    });
    const token = signJwt(user);
    respondWithPopupSuccess(res, req, user, token);
  } catch (err) {
    console.error('[auth/kakao] 로그인 실패:', err.message);
    respondWithPopupError(res, '카카오 로그인 중 오류가 발생했습니다.');
  }
});

module.exports = router;
