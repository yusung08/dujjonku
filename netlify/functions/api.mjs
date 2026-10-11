// Netlify Functions (v2) — 서버 시간 / 랭킹 / 친구 / 선물 API
//  GET  /api/time                         -> { t }                       (출석 날짜 검사용 서버 시각)
//  GET  /api/rank?by=eaten|dg|prest&id=   -> 상위 50명
//  POST /api/rank                         -> 내 기록 등록/갱신
//  GET  /api/friends?codes=A,B            -> 친구 코드로 프로필 조회 (최대 30)
//  POST /api/gift {id, code}              -> 친구에게 선물 (하루 1번/친구)
//  GET  /api/inbox?id=                    -> 받은 선물 개수
//  POST /api/inbox {id}                   -> 받은 선물 수령(개수 반환 후 0으로)
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/*" };

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clean = (v) => String(v || "").replace(/[<>&"'`]/g, "").trim().slice(0, 12);
const int = (v) => Math.floor(Number(v) || 0);
const codeOf = (id) => String(id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
const day = () => new Date().toISOString().slice(0, 10);

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const q = url.searchParams;

  if (route === "time") return json({ t: Date.now() });

  const store = getStore("rank");
  const board = (await store.get("board", { type: "json" })) || {};
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  // ---------- 랭킹 ----------
  if (route === "rank" && req.method === "POST") {
    const b = await body();
    const id = String(b.id || "").slice(0, 64);
    const name = clean(b.name);
    const rec = { name, eaten: int(b.eaten), dg: int(b.dg), prest: int(b.prest), pets: int(b.pets) };
    if (!id || !name || [rec.eaten, rec.dg, rec.prest, rec.pets].some((x) => x < 0 || x > 1e9))
      return json({ error: "bad_input" }, 400);

    // 간단한 이상치 방지: 마지막 제출 이후 시간 대비 너무 큰 증가는 거절
    const old = board[id], now = Date.now();
    if (old) {
      const mins = Math.max(1, (now - old.t) / 60000);
      if (rec.eaten > old.eaten + mins * 300 + 500 || rec.dg > old.dg + mins * 3 + 5 || rec.prest > old.prest + 2)
        return json({ error: "suspicious" }, 429);
    } else if (rec.eaten > 3000 || rec.dg > 40 || rec.prest > 3) {
      return json({ error: "suspicious" }, 429);
    }
    board[id] = { ...rec, t: now };

    const ids = Object.keys(board);
    if (ids.length > 2000) {
      ids.sort((a, c) => board[c].eaten - board[a].eaten).slice(1500).forEach((k) => delete board[k]);
    }
    await store.setJSON("board", board);
    return json({ ok: true });
  }

  if (route === "rank") {
    const by = ["eaten", "dg", "prest"].includes(q.get("by")) ? q.get("by") : "eaten";
    const me = q.get("id") || "";
    const rows = Object.entries(board)
      .sort((a, c) => c[1][by] - a[1][by] || c[1].eaten - a[1].eaten)
      .slice(0, 50)
      .map(([id, r]) => ({ name: r.name, eaten: r.eaten, dg: r.dg, prest: r.prest, pets: r.pets, me: id === me }));
    return json(rows);
  }

  // ---------- 친구 ----------
  if (route === "friends") {
    const want = new Set(String(q.get("codes") || "").toUpperCase().split(",").filter(Boolean).slice(0, 30));
    const rows = Object.entries(board)
      .filter(([id]) => want.has(codeOf(id)))
      .map(([id, r]) => ({ code: codeOf(id), name: r.name, eaten: r.eaten, dg: r.dg, prest: r.prest, pets: r.pets }));
    return json(rows);
  }

  const inbox = (await store.get("inbox", { type: "json" })) || {};

  if (route === "gift" && req.method === "POST") {
    const b = await body();
    const from = String(b.id || "").slice(0, 64), to = String(b.code || "").toUpperCase();
    if (!board[from]) return json({ error: "no_name" }, 400);
    const target = Object.keys(board).find((id) => codeOf(id) === to);
    if (!target || target === from) return json({ error: "no_friend" }, 404);
    const box = inbox[target] || { n: 0, sent: {} };
    const key = codeOf(from) + ":" + day();
    if (box.sent[key]) return json({ error: "already" }, 429);
    Object.keys(box.sent).forEach((k) => { if (!k.endsWith(day())) delete box.sent[k]; });
    box.sent[key] = 1;
    box.n = Math.min(50, (box.n || 0) + 1);
    inbox[target] = box;
    await store.setJSON("inbox", inbox);
    return json({ ok: true });
  }

  if (route === "inbox" && req.method === "POST") {
    const b = await body();
    const id = String(b.id || "").slice(0, 64), box = inbox[id];
    const n = box ? box.n || 0 : 0;
    if (box && n) { box.n = 0; await store.setJSON("inbox", inbox); }
    return json({ n });
  }
  if (route === "inbox") {
    const box = inbox[q.get("id") || ""];
    return json({ n: box ? box.n || 0 : 0 });
  }

  return json({ error: "not_found" }, 404);
};
