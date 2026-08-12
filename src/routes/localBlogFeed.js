/**
 * 네이버 블로그/카페 검색(Open API) + OpenAI 요약 프록시.
 *
 * NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 없으면 503을 반환하고,
 * 프론트엔드(index.html)는 이를 감지해 다낭/나트랑 Mock Data로 자동 폴백한다.
 * OPENAI_API_KEY만 없는 경우에는 네이버 검색 API가 제공하는 발췌문(description)을
 * 그대로 요약으로 사용하고 aiSummarized:false를 내려줘 프론트에서 "AI 요약 준비중" 배지를 표시하게 한다.
 *
 * 저작권 이슈 방지: 원문 본문을 별도로 스크래핑하지 않고, 네이버 검색 API가 공식적으로 제공하는
 * title/description(발췌문)만 AI 입력으로 사용한다.
 *
 * 캐싱: 카테고리 없이("전체") 조회한 결과는 dest_info_cache 테이블에 저장되고, 다음 요청부터는
 * 24시간 이내면 캐시를 즉시 반환한다(네이버/OpenAI 호출 절약). src/cron.js의 일일 스케줄러가 매일
 * 00시(KST)에 이 캐시를 미리 갱신해둔다 — 카테고리 필터가 있는 요청은 정확도를 위해 항상 즉시 조회한다.
 */
const express = require('express');
const router = express.Router();
const { getDestBlogFeedCache, upsertDestBlogFeedCache } = require('../db');

const CATEGORY_QUERY = { '맛집': '맛집 추천', '숙소': '숙소 호텔', '교통': '교통 이동 꿀팁', '쇼핑': '쇼핑 기념품' };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

router.get('/', async (req, res) => {
  const { dest, category } = req.query;
  if (!dest) return res.status(400).json({ error: 'dest 파라미터가 필요합니다.' });

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return res.status(503).json({
      error: '네이버 검색 API가 아직 설정되지 않았습니다.',
      hint: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET을 .env에 설정하세요 (README 8번 참고).',
    });
  }

  if (!category) {
    const cached = getDestBlogFeedCache(dest);
    if (cached && Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL_MS) {
      return res.json({ items: cached.items, cached: true, updatedAt: cached.updatedAt });
    }
  }

  try {
    const items = await fetchBlogFeedLive(dest, category);
    if (!category) upsertDestBlogFeedCache(dest, items);
    res.json({ items });
  } catch (err) {
    console.error('[local-blog-feed] 조회 실패:', err.message);
    res.status(502).json({ error: '블로그/카페 정보를 불러오지 못했습니다.' });
  }
});

/** 네이버 검색 + AI 요약 + 대표 이미지까지 실제로 수행한다. 라우트 핸들러와 cron 갱신 작업이 공용으로 사용. */
async function fetchBlogFeedLive(dest, category) {
  const query = `${dest} ${CATEGORY_QUERY[category] || '여행'}`;
  const [blogItems, cafeItems] = await Promise.all([
    searchNaver('blog', query),
    searchNaver('cafearticle', query),
  ]);
  const raw = [
    ...blogItems.map((i) => ({ ...i, source: '네이버블로그' })),
    ...cafeItems.map((i) => ({ ...i, source: '네이버카페' })),
  ];
  return Promise.all(
    raw.map(async (i) => {
      const [summarized, thumbnail] = await Promise.all([
        summarizeWithAI(i, dest, category),
        fetchNaverThumbnail(i.title),
      ]);
      // thumbnail이 null이면 프론트엔드(index.html의 getNaverFeedImage)가 카테고리별 사진 풀로 자동 대체함
      return { ...summarized, thumbnail };
    })
  );
}

/** cron.js의 일일 스케줄러가 호출하는 캐시 갱신 함수. NAVER 키가 없으면 조용히 건너뛴다. */
async function refreshBlogFeedCache(dest) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) return;
  const items = await fetchBlogFeedLive(dest, undefined);
  upsertDestBlogFeedCache(dest, items);
}

/** 네이버 검색 API(블로그/카페) 호출. 공식 문서: https://developers.naver.com/docs/serviceapi/search/blog/blog.md */
async function searchNaver(type, query) {
  const params = new URLSearchParams({ query, display: '5', sort: 'sim' });
  const res = await fetch(`https://openapi.naver.com/v1/search/${type}.json?${params}`, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) throw new Error(`Naver ${type} 검색 API 응답 오류 (${res.status})`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: stripHtml(it.title),
    author: it.bloggername || it.cafename || '작성자 비공개',
    date: formatNaverDate(it.postdate || it.datetime),
    rawSummary: stripHtml(it.description),
    url: it.link,
  }));
}

/**
 * 게시글 썸네일: 네이버 블로그/카페 검색 API는 thumbnail 필드를 내려주지 않으므로(공식 문서 기준
 * title/link/description/postdate 등만 제공), 별도로 네이버 이미지 검색 API에서 제목으로 관련
 * 이미지를 찾아온다. 그 글의 "실제" 썸네일은 아니고 제목과 관련된 이미지라는 점에 유의.
 * ⚠️ 네이버 개발자센터에서 "검색 > 이미지" API를 별도로 사용 설정해야 동작함 (블로그/카페 검색과는
 * 별개 항목). 미설정이거나 실패해도 null을 반환할 뿐 나머지 응답에는 영향 없음(프론트에서 카테고리
 * 사진 풀로 자동 대체됨) — 실패를 절대 전체 요청 실패로 만들지 않는다.
 */
async function fetchNaverThumbnail(query) {
  try {
    const params = new URLSearchParams({ query, display: '1', sort: 'sim', filter: 'large' });
    const res = await fetch(`https://openapi.naver.com/v1/search/image?${params}`, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items && data.items[0] && data.items[0].thumbnail) || null;
  } catch (e) {
    console.error('[local-blog-feed] 이미지 검색 실패(무시하고 계속):', e.message);
    return null;
  }
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '');
}
function formatNaverDate(d) {
  if (!d) return '';
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  return d.slice(0, 10).replace(/-/g, '.');
}

/**
 * OpenAI로 "핵심 꿀팁 3줄 요약" + 대표 키워드 해시태그를 생성한다.
 * 저작권 이슈 방지를 위해 원문 전체가 아닌 네이버 검색 API의 발췌문(rawSummary)만 입력으로 사용.
 */
async function summarizeWithAI(item, dest, category) {
  if (!process.env.OPENAI_API_KEY) {
    return { ...item, summaryLines: [item.rawSummary].filter(Boolean), keywords: [], aiSummarized: false };
  }
  try {
    const prompt = `여행 블로그/카페 글의 제목과 발췌문을 보고 "핵심 꿀팁 3줄 요약"과 대표 키워드 3개를 뽑아줘.
제목: ${item.title}
발췌문: ${item.rawSummary}
여행지: ${dest} / 카테고리: ${category || '여행'}
반드시 아래 JSON 형식으로만 답해:
{"summaryLines": ["...", "...", "..."], "keywords": ["#...", "#...", "#..."]}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API 응답 오류 (${res.status})`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return {
      ...item,
      summaryLines: parsed.summaryLines || [item.rawSummary].filter(Boolean),
      keywords: parsed.keywords || [],
      aiSummarized: true,
    };
  } catch (e) {
    console.error('[local-blog-feed] OpenAI 요약 실패:', e.message);
    return { ...item, summaryLines: [item.rawSummary].filter(Boolean), keywords: [], aiSummarized: false };
  }
}

module.exports = router;
module.exports.refreshBlogFeedCache = refreshBlogFeedCache;
