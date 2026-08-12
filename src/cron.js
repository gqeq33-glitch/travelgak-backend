/**
 * 매일 00:00(KST) 실행되는 일일 현지 정보 갱신 스케줄러.
 * - 네이버 검색 API로 여행지별 인기 블로그/카페 글 캐시 갱신 (localBlogFeed.js)
 * - 외교부 해외안전여행(공공데이터포털) API로 여행경보 캐시 갱신 (mofaSafety.js)
 * 두 작업 모두 관련 API 키가 없으면 조용히 건너뛴다 — 이 크론은 "있으면 더 좋아지는" 보강 작업이라
 * 키 미설정 상태에서도 서버 기동/기존 기능에 전혀 영향을 주지 않는다.
 */
const cron = require('node-cron');
const { refreshBlogFeedCache } = require('./routes/localBlogFeed');
const { refreshMofaSafetyCache } = require('./mofaSafety');

// 캐시 대상 여행지. 네이버 API 일일 호출 한도(기본 25,000회/일)를 감안해 인기 여행지 위주로 제한.
const CRON_DESTINATIONS = ['다낭', '오사카', '방콕', '제주', '도쿄', '후쿠오카', '타이베이', '홍콩', '발리', '싱가포르'];

function startDailyRefreshCron() {
  // '0 0 * * *' = 매일 0시 0분. timezone을 명시해서 서버가 어느 지역에 배포되든 항상 한국시간 자정에 실행.
  cron.schedule(
    '0 0 * * *',
    async () => {
      const startedAt = new Date().toISOString();
      console.log(`[cron] 일일 현지 정보 갱신 시작 (${startedAt})`);
      for (const dest of CRON_DESTINATIONS) {
        // 여행지를 순차 처리 — 네이버/OpenAI API 순간 호출량(rate limit) 초과를 피하기 위해 병렬로 돌리지 않음
        await refreshBlogFeedCache(dest).catch((e) => console.error(`[cron] ${dest} 블로그 피드 갱신 실패:`, e.message));
      }
      await refreshMofaSafetyCache(CRON_DESTINATIONS).catch((e) => console.error('[cron] 외교부 안전정보 갱신 실패:', e.message));
      console.log('[cron] 일일 현지 정보 갱신 완료');
    },
    { timezone: 'Asia/Seoul' }
  );
  console.log('[cron] 일일 현지 정보 갱신 스케줄러 등록됨 (매일 00:00 KST, 대상:', CRON_DESTINATIONS.join(', '), ')');
}

module.exports = { startDailyRefreshCron };
