/**
 * 마이페이지: 로그인한 유저의 일정 저장/조회.
 * 웹사이트 "상세 견적 확인 → 마이페이지에 저장" 버튼(로그인 필요)이 이 API를 호출한다.
 */
const express = require('express');
const { requireAuth } = require('../authMiddleware');
const { saveItinerary, listItineraries } = require('../db');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ itineraries: listItineraries(req.user.id) });
});

router.post('/', (req, res) => {
  const { destination, days, totalCost, items } = req.body || {};
  if (!destination) return res.status(400).json({ error: 'destination은 필수입니다.' });
  const saved = saveItinerary({ userId: req.user.id, destination, days, totalCost, items });
  res.status(201).json({ itinerary: saved });
});

module.exports = router;
