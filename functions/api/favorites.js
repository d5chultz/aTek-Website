// Cloudflare Pages Function: /api/favorites
// Stores and syncs WLOB community favorites directly inside the Cloudflare R2 bucket (atek-media/favorites.json)
// No Google Sheet required.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Content-Type": "application/json; charset=utf-8"
};

const R2_KEY = "favorites.json";

async function loadState(bucket) {
  if (!bucket) return { votes: {}, names: {} };
  try {
    const obj = await bucket.get(R2_KEY);
    if (!obj) return { votes: {}, names: {} };
    const data = await obj.json();
    const votes = (data && typeof data.votes === "object" && data.votes) ? data.votes : {};
    const names = (data && typeof data.names === "object" && data.names) ? data.names : {};
    if (Array.isArray(data && data.leaderboard)) {
      for (const item of data.leaderboard) {
        if (item && item.file) {
          if (typeof votes[item.file] !== "number" && typeof item.votes === "number") {
            votes[item.file] = item.votes;
          }
          if (item.name && !names[item.file]) {
            names[item.file] = item.name;
          }
        }
      }
    }
    return { votes, names };
  } catch (_) {
    return { votes: {}, names: {} };
  }
}

function buildResponsePayload(votes, names) {
  const cleanVotes = {};
  const leaderboard = [];
  for (const [file, rawCount] of Object.entries(votes)) {
    const count = Math.max(0, parseInt(rawCount, 10) || 0);
    if (file && count > 0) {
      cleanVotes[file] = count;
      leaderboard.push({
        file,
        votes: count,
        name: names[file] || ""
      });
    }
  }
  leaderboard.sort((a, b) => b.votes - a.votes);
  return {
    ok: true,
    totalTracked: leaderboard.length,
    votes: cleanVotes,
    names,
    leaderboard,
    updatedAt: new Date().toISOString()
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const bucket = context.env && context.env.MEDIA_BUCKET;
  const { votes, names } = await loadState(bucket);
  const payload = buildResponsePayload(votes, names);
  return new Response(JSON.stringify(payload), { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const bucket = context.env && context.env.MEDIA_BUCKET;
  if (!bucket) {
    return new Response(JSON.stringify({ ok: false, error: "MEDIA_BUCKET binding missing" }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }

  let body = {};
  try {
    const text = await context.request.text();
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = {};
  }

  const { votes, names } = await loadState(bucket);
  const action = String(body.action || "add").toLowerCase();

  // Support batch merging an array of files (e.g. syncing any local favorites into R2)
  if (action === "merge" && Array.isArray(body.files)) {
    for (const f of body.files) {
      const file = String(f || "").trim();
      if (file && !(votes[file] > 0)) {
        votes[file] = 1;
      }
    }
  } else {
    const file = String(body.file || body.filename || "").trim();
    const name = String(body.name || "").trim();
    if (!file) {
      return new Response(JSON.stringify({ ok: false, error: "Missing filename" }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }
    if (name) names[file] = name;
    const current = Math.max(0, parseInt(votes[file], 10) || 0);
    if (action === "add" || action === "upvote" || action === "favorite") {
      votes[file] = current + 1;
    } else if (action === "remove" || action === "downvote" || action === "unfavorite") {
      // Remove across the board when unfavorited so shared favorites stay in sync
      delete votes[file];
    }
  }

  const payload = buildResponsePayload(votes, names);
  await bucket.put(R2_KEY, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });

  return new Response(JSON.stringify(payload), { status: 200, headers: CORS_HEADERS });
}
