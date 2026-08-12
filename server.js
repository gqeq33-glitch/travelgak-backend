require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const kakaoRoutes = require('./src/routes/kakao');
const chatRoutes = require('./src/routes/chat');
const adminRoutes = require('./src/routes/admin');
const hotelsRoutes = require('./src/routes/hotels');
const localBlogFeedRoutes = require('./src/routes/localBlogFeed');
const authRoutes = require('./src/routes/auth');
const itinerariesRoutes = require('./src/routes/itineraries');
const destInfoRoutes = require('./src/routes/destInfo');
const { requireAuth } = require('./src/authMiddleware');
const { startDailyRefreshCron } = require('./src/cron');

const app = express();
// helmet: 보안 헤더 일괄 적용(HSTS 포함). HSTS는 HTTPS로 서빙될 때만 브라우저가 실제로 강제하므로,
// 로컬 HTTP 개발환경에서는 아무 영향 없고 Render/Railway 등 HTTPS 배포 환경에서 자동으로 활성화된다.
app.use(helmet());
app.use(express.json());

const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors({ origin: allowedOrigin ? allowedOrigin.split(',') : '*' }));

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'travel-gak-backend',
    endpoints: ['/kakao/webhook', '/api/chat', '/api/admin/*', '/api/hotels', '/api/local-blog-feed', '/api/dest-info', '/auth/naver/login', '/auth/kakao/login', '/api/me', '/api/itineraries'],
  });
});

app.use('/kakao', kakaoRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hotels', hotelsRoutes);
app.use('/api/local-blog-feed', localBlogFeedRoutes);
app.use('/api/dest-info', destInfoRoutes);
app.use('/auth', authRoutes);
app.use('/api/itineraries', itinerariesRoutes);
app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`여행각 백엔드 서버 실행 중: http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고).');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET이 설정되지 않았습니다. 로그인 기능이 동작하지 않습니다 (.env.example 참고).');
  }
  startDailyRefreshCron();
});
