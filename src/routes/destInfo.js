/**
 * cron.js가 매일 갱신해두는 여행지 캐시(블로그 피드 + 외교부 안전정보)를 그대로 내려주는 조회 전용 API.
 * 프론트엔드의 DEST_QUICK_INFO(정적 비자/전압/시차 값)를 이 실시간 캐시로 보강하고 싶을 때 사용.
 */
const express = require('express');
const router = express.Router();
const { getDestBlogFeedCache, getDestMofaCache } = require('../db');

router.get('/', (req, res) => {
  const { dest } = req.query;
  if (!dest) return res.status(400).json({ error: 'dest 파라미터가 필요합니다.' });
  const blogFeed = getDestBlogFeedCache(dest);
  const mofa = getDestMofaCache(dest);
  if (!blogFeed && !mofa) {
    return res.status(404).json({ error: '아직 캐시된 정보가 없습니다. 크론이 한 번 이상 돈 뒤 다시 확인해주세요.' });
  }
  res.json({
    dest,
    blogFeed: blogFeed ? { items: blogFeed.items, updatedAt: blogFeed.updatedAt } : null,
    mofa: mofa ? { data: mofa.data, updatedAt: mofa.updatedAt } : null,
  });
});

module.exports = router;
