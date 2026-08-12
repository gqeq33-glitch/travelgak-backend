/**
 * 여행각 백엔드 로컬 DB (SQLite, Node 22.5+ 내장 node:sqlite 모듈 — 별도 네이티브 빌드 불필요).
 * 별도 DB 서버 없이 파일 하나(data.sqlite)로 동작 — 배포 플랫폼에 디스크가 유지되는지 확인할 것
 * (Render 무료 플랜은 재배포 시 디스크가 초기화될 수 있음. 영구 저장이 필요하면 Render Disk 또는
 * 외부 DB(Postgres 등)로 교체 권장. 지금은 로그인/일정저장 기능이 "동작하는 것"을 우선한 최소 구성).
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // Node 22.5+ 내장 모듈, 네이티브 빌드(node-gyp) 불필요

const db = new DatabaseSync(path.join(__dirname, '..', 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_user_id)
  );

  CREATE TABLE IF NOT EXISTS itineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    destination TEXT NOT NULL,
    days INTEGER,
    total_cost INTEGER,
    items_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 일일 스케줄러(src/cron.js)가 갱신하는 여행지별 캐시. 네이버 블로그/카페 피드와
  -- 외교부 해외안전여행 정보를 따로 저장해서, 어느 한쪽 API만 설정돼 있어도 나머지는 정상 캐싱된다.
  CREATE TABLE IF NOT EXISTS dest_info_cache (
    dest TEXT PRIMARY KEY,
    blog_feed_json TEXT,
    blog_feed_updated_at TEXT,
    mofa_json TEXT,
    mofa_updated_at TEXT
  );

  -- 유료 전환될 수 있는 외부 API(Google Places 등) 호출 횟수를 월별로 세어 무료 한도 초과를 막는 데 쓴다.
  CREATE TABLE IF NOT EXISTS api_usage_counters (
    counter_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
  );
`);

function upsertUser({ provider, providerUserId, nickname, email }) {
  const existing = db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?')
    .get(provider, providerUserId);
  if (existing) return existing;
  const info = db
    .prepare('INSERT INTO users (provider, provider_user_id, nickname, email) VALUES (?, ?, ?, ?)')
    .run(provider, providerUserId, nickname, email || null);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function saveItinerary({ userId, destination, days, totalCost, items }) {
  const info = db
    .prepare('INSERT INTO itineraries (user_id, destination, days, total_cost, items_json) VALUES (?, ?, ?, ?, ?)')
    .run(userId, destination, days || null, totalCost || 0, JSON.stringify(items || []));
  return db.prepare('SELECT * FROM itineraries WHERE id = ?').get(info.lastInsertRowid);
}

function listItineraries(userId) {
  return db
    .prepare('SELECT * FROM itineraries WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map((row) => ({
      id: row.id,
      destination: row.destination,
      days: row.days,
      totalCost: row.total_cost,
      items: JSON.parse(row.items_json || '[]'),
      createdAt: row.created_at,
    }));
}

function upsertDestBlogFeedCache(dest, items) {
  db.prepare(`
    INSERT INTO dest_info_cache (dest, blog_feed_json, blog_feed_updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(dest) DO UPDATE SET blog_feed_json = excluded.blog_feed_json, blog_feed_updated_at = excluded.blog_feed_updated_at
  `).run(dest, JSON.stringify(items));
}
function getDestBlogFeedCache(dest) {
  const row = db.prepare('SELECT blog_feed_json, blog_feed_updated_at FROM dest_info_cache WHERE dest = ?').get(dest);
  if (!row || !row.blog_feed_json) return null;
  return { items: JSON.parse(row.blog_feed_json), updatedAt: row.blog_feed_updated_at };
}
function upsertDestMofaCache(dest, data) {
  db.prepare(`
    INSERT INTO dest_info_cache (dest, mofa_json, mofa_updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(dest) DO UPDATE SET mofa_json = excluded.mofa_json, mofa_updated_at = excluded.mofa_updated_at
  `).run(dest, JSON.stringify(data));
}
function getDestMofaCache(dest) {
  const row = db.prepare('SELECT mofa_json, mofa_updated_at FROM dest_info_cache WHERE dest = ?').get(dest);
  if (!row || !row.mofa_json) return null;
  return { data: JSON.parse(row.mofa_json), updatedAt: row.mofa_updated_at };
}

/** counterKey(예: 'places_api:2026-08') 호출 횟수를 1 늘리고, 늘어난 뒤의 값을 반환한다. */
function incrementApiUsage(counterKey) {
  db.prepare(`
    INSERT INTO api_usage_counters (counter_key, count) VALUES (?, 1)
    ON CONFLICT(counter_key) DO UPDATE SET count = count + 1
  `).run(counterKey);
  return db.prepare('SELECT count FROM api_usage_counters WHERE counter_key = ?').get(counterKey).count;
}

module.exports = {
  db, upsertUser, getUserById, saveItinerary, listItineraries,
  upsertDestBlogFeedCache, getDestBlogFeedCache, upsertDestMofaCache, getDestMofaCache,
  incrementApiUsage,
};
