const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ARTICLES_DIR = path.join(ROOT_DIR, "data", "entries");
const DAILY_PROGRESS_FILE = path.join(DATA_DIR, "daily-progress.json");
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TITLE_LENGTH = 100;
const MAX_FANDOM_LENGTH = 40;
const MAX_CP_LENGTH = 48;
const MAX_EXCERPT_LENGTH = 220;
const MAX_CONTENT_LENGTH = 100000;
const MAX_TAG_LENGTH = 24;
const MAX_TAG_COUNT = 12;
const SESSION_COOKIE_NAME = "lyra_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const USING_DEFAULT_PASSWORD = !process.env.ADMIN_PASSWORD;
const REMOTE_ADMIN_ENABLED = process.env.ENABLE_REMOTE_ADMIN === "true";
const ADMIN_UI_ENABLED = process.env.RENDER !== "true" || REMOTE_ADMIN_ENABLED;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const sessions = new Map();

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(message);
}

function trimTo(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function toSlug(value) {
  return trimTo(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildPreview(content, maxLength = 160) {
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeSearchQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function parseTags(value) {
  const tags = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,，]+/)
        .map((tag) => tag.trim());

  return Array.from(
    new Set(tags.map((tag) => trimTo(tag, MAX_TAG_LENGTH)).filter(Boolean))
  ).slice(0, MAX_TAG_COUNT);
}

function normalizeProgressDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) ? date : "";
}

function parseWordCount(value) {
  const words = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(words) || words < 0) {
    throw new Error("码字数必须是大于或等于 0 的整数。");
  }
  return words;
}

function matchesSearch(article, query) {
  if (!query) {
    return true;
  }

  const terms = normalizeSearchQuery(query)
    .toLowerCase()
    .split(" ")
    .filter(Boolean);

  if (!terms.length) {
    return true;
  }

  const haystack = [article.title, article.tags.join(" ")]
    .join("\n")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";

  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((cookies, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex < 0) {
        return cookies;
      }

      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function getRequestUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  return new URL(req.url, `http://${host}`);
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ARTICLES_DIR, { recursive: true });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求体过大，当前仅支持 256KB 以内的文本。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function buildPermalink(article) {
  return `${article.id}-${article.slug}`;
}

function normalizeProgressEntry(rawEntry) {
  const date = normalizeProgressDate(rawEntry?.date ?? rawEntry?.month);
  const parsedWords = Number.parseInt(String(rawEntry?.words ?? ""), 10);

  if (!date || !Number.isFinite(parsedWords) || parsedWords < 0) {
    return null;
  }

  const createdAt = rawEntry.createdAt || new Date().toISOString();
  const updatedAt = rawEntry.updatedAt || createdAt;

  return {
    date,
    words: parsedWords,
    createdAt,
    updatedAt
  };
}

function normalizeArticle(rawArticle, filePath) {
  const id = String(rawArticle.id || path.basename(filePath, ".json"));
  const slug = trimTo(rawArticle.slug, 48) || toSlug(rawArticle.title || "article") || "article";
  const content = String(rawArticle.content || "").trim();
  const createdAt = rawArticle.createdAt || new Date().toISOString();
  const updatedAt = rawArticle.updatedAt || createdAt;
  const fandom =
    trimTo(rawArticle.fandom, MAX_FANDOM_LENGTH) ||
    trimTo(rawArticle.board, MAX_FANDOM_LENGTH) ||
    "未分类";
  const cp =
    trimTo(rawArticle.cp, MAX_CP_LENGTH) ||
    trimTo(rawArticle.pairing, MAX_CP_LENGTH) ||
    trimTo(rawArticle.category, MAX_CP_LENGTH) ||
    "";

  return {
    id,
    slug,
    permalink: buildPermalink({ id, slug }),
    title: trimTo(rawArticle.title, MAX_TITLE_LENGTH) || "未命名文章",
    fandom,
    cp,
    tags: parseTags(rawArticle.tags ?? rawArticle.tag ?? []),
    excerpt: trimTo(rawArticle.excerpt, MAX_EXCERPT_LENGTH) || buildPreview(content, MAX_EXCERPT_LENGTH),
    content,
    published: rawArticle.published === undefined ? true : Boolean(rawArticle.published),
    sourceName: trimTo(rawArticle.sourceName, 120) || "后台手动创建",
    createdAt,
    updatedAt,
    filePath
  };
}

function toPublicListView(article) {
  return {
    id: article.id,
    slug: article.slug,
    permalink: article.permalink,
    title: article.title,
    fandom: article.fandom,
    cp: article.cp,
    tags: article.tags,
    excerpt: article.excerpt,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
}

function toPublicDetailView(article) {
  return {
    ...toPublicListView(article),
    content: article.content
  };
}

function toAdminArticleView(article) {
  return {
    id: article.id,
    slug: article.slug,
    permalink: article.permalink,
    title: article.title,
    fandom: article.fandom,
    cp: article.cp,
    tags: article.tags,
    excerpt: article.excerpt,
    content: article.content,
    sourceName: article.sourceName,
    published: article.published,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
}

function buildCategorySummaries(articles) {
  const grouped = new Map();

  articles.forEach((article) => {
    const categoryName = article.cp || "未填写 CP";

    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, {
        name: categoryName,
        count: 0,
        fandoms: new Set(),
        latestUpdatedAt: article.updatedAt,
        latestTitle: article.title,
        latestPermalink: article.permalink
      });
    }

    const summary = grouped.get(categoryName);
    summary.count += 1;
    summary.fandoms.add(article.fandom);

    if (new Date(article.updatedAt).getTime() > new Date(summary.latestUpdatedAt).getTime()) {
      summary.latestUpdatedAt = article.updatedAt;
      summary.latestTitle = article.title;
      summary.latestPermalink = article.permalink;
    }
  });

  return Array.from(grouped.values())
    .map((summary) => ({
      name: summary.name,
      count: summary.count,
      fandoms: Array.from(summary.fandoms).sort((a, b) => a.localeCompare(b, "zh-CN")),
      latestUpdatedAt: summary.latestUpdatedAt,
      latestTitle: summary.latestTitle,
      latestPermalink: summary.latestPermalink
    }))
    .sort((a, b) => new Date(b.latestUpdatedAt).getTime() - new Date(a.latestUpdatedAt).getTime());
}

function buildTagCount(articles) {
  return new Set(articles.flatMap((article) => article.tags)).size;
}

function buildStats(articles) {
  return {
    publishedCount: articles.length,
    categoryCount: buildCategorySummaries(articles).length,
    tagCount: buildTagCount(articles)
  };
}

function toPublicProgressView(entry) {
  return {
    date: entry.date,
    words: entry.words,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

function buildWritingStats(entries) {
  return {
    trackedDays: entries.length,
    totalWords: entries.reduce((sum, entry) => sum + entry.words, 0),
    latestDate: entries[0]?.date || "",
    latestWords: entries[0]?.words || 0
  };
}

function findArticleByReference(articles, reference) {
  return articles.find(
    (article) =>
      article.id === reference || article.slug === reference || article.permalink === reference
  );
}

async function readStoredArticles() {
  await ensureDataDir();
  const names = await fs.readdir(ARTICLES_DIR);

  const articles = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const filePath = path.join(ARTICLES_DIR, name);
        const raw = await fs.readFile(filePath, "utf8");
        const article = JSON.parse(raw);
        return normalizeArticle(article, filePath);
      })
  );

  return articles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function readDailyProgress() {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(DAILY_PROGRESS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeProgressEntry)
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeDailyProgress(entries) {
  await ensureDataDir();
  await fs.writeFile(
    DAILY_PROGRESS_FILE,
    JSON.stringify(entries.map(toPublicProgressView), null, 2),
    "utf8"
  );
}

async function upsertDailyProgress(payload) {
  const date = normalizeProgressDate(payload.date ?? payload.month);
  if (!date) {
    throw new Error("日期格式不正确，请使用 YYYY-MM-DD。");
  }

  const words = parseWordCount(payload.words);
  const now = new Date().toISOString();
  const entries = await readDailyProgress();
  const existing = entries.find((entry) => entry.date === date);

  if (existing) {
    existing.words = words;
    existing.updatedAt = now;
  } else {
    entries.push({
      date,
      words,
      createdAt: now,
      updatedAt: now
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  await writeDailyProgress(entries);
  return entries.find((entry) => entry.date === date);
}

async function deleteDailyProgress(dateValue) {
  const date = normalizeProgressDate(dateValue);
  if (!date) {
    throw new Error("日期格式不正确。");
  }

  const entries = await readDailyProgress();
  const nextEntries = entries.filter((entry) => entry.date !== date);

  if (nextEntries.length === entries.length) {
    throw new Error("没有找到这条码字记录。");
  }

  await writeDailyProgress(nextEntries);
}

async function writeArticleFile(article, filePath) {
  const payload = {
    id: article.id,
    slug: article.slug,
    title: article.title,
    fandom: article.fandom,
    cp: article.cp,
    tags: article.tags,
    excerpt: article.excerpt,
    content: article.content,
    published: article.published,
    sourceName: article.sourceName,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function prepareArticleData(payload, existingArticle = null) {
  const title = trimTo(payload.title, MAX_TITLE_LENGTH) || existingArticle?.title || "未命名文章";
  const fandom =
    trimTo(payload.fandom, MAX_FANDOM_LENGTH) ||
    trimTo(payload.category, MAX_FANDOM_LENGTH) ||
    existingArticle?.fandom ||
    "未分类";
  const cp =
    trimTo(payload.cp, MAX_CP_LENGTH) ||
    trimTo(payload.pairing, MAX_CP_LENGTH) ||
    existingArticle?.cp ||
    "";
  const tags =
    payload.tags === undefined ? existingArticle?.tags || [] : parseTags(payload.tags);
  const content = String(payload.content ?? existingArticle?.content ?? "").trim();
  const excerpt =
    trimTo(payload.excerpt, MAX_EXCERPT_LENGTH) || buildPreview(content, MAX_EXCERPT_LENGTH);
  const sourceName =
    trimTo(payload.sourceName, 120) || existingArticle?.sourceName || "后台手动创建";
  const published =
    payload.published === undefined
      ? Boolean(existingArticle?.published)
      : parseBoolean(payload.published, Boolean(existingArticle?.published));

  if (!content) {
    throw new Error("文章内容不能为空。");
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`文本过长，最多支持 ${MAX_CONTENT_LENGTH} 个字符。`);
  }

  return {
    title,
    slug: toSlug(title) || existingArticle?.slug || "article",
    fandom,
    cp,
    tags,
    excerpt,
    content,
    sourceName,
    published
  };
}

async function createArticle(payload) {
  await ensureDataDir();

  const createdAt = new Date().toISOString();
  const id = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const data = prepareArticleData(payload);
  const filePath = path.join(ARTICLES_DIR, `${id}-${data.slug}.json`);
  const article = {
    id,
    ...data,
    createdAt,
    updatedAt: createdAt
  };

  await writeArticleFile(article, filePath);
  return normalizeArticle(article, filePath);
}

async function updateArticle(id, payload) {
  const articles = await readStoredArticles();
  const match = articles.find((article) => article.id === id);

  if (!match) {
    throw new Error("文章不存在。");
  }

  const data = prepareArticleData(payload, match);
  const updatedArticle = {
    ...match,
    ...data,
    updatedAt: new Date().toISOString()
  };

  await writeArticleFile(updatedArticle, match.filePath);
  return normalizeArticle(updatedArticle, match.filePath);
}

async function updateArticlePublication(id, published) {
  return updateArticle(id, { published });
}

async function deleteArticle(id) {
  const articles = await readStoredArticles();
  const match = articles.find((article) => article.id === id);

  if (!match) {
    throw new Error("文章不存在。");
  }

  await fs.unlink(match.filePath);
  return match;
}

function isValidPassword(password) {
  const expected = Buffer.from(ADMIN_PASSWORD);
  const provided = Buffer.from(String(password || ""));

  if (expected.length !== provided.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

function pruneExpiredSessions() {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function createSession() {
  pruneExpiredSessions();
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getAuthenticatedSession(req) {
  pruneExpiredSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, session };
}

function createSessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function requireAdmin(req, res) {
  if (!ADMIN_UI_ENABLED) {
    sendText(res, 404, "Not Found");
    return null;
  }

  const auth = getAuthenticatedSession(req);
  if (!auth) {
    sendJson(res, 401, { error: "请先登录后台。" });
    return null;
  }
  return auth;
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(getRequestUrl(req).pathname);
  let relativePath = urlPath;

  if (relativePath === "/") {
    relativePath = "/index.html";
  } else if (relativePath === "/admin") {
    if (!ADMIN_UI_ENABLED) {
      sendText(res, 404, "Not Found");
      return;
    }
    relativePath = "/admin.html";
  } else if (relativePath.startsWith("/article/") && relativePath.length > "/article/".length) {
    relativePath = "/article.html";
  }

  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      sendText(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const file = await fs.readFile(filePath);

    res.writeHead(200, {
      "Content-Type": contentType
    });
    res.end(file);
  } catch (error) {
    sendText(res, 404, "Not Found");
  }
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendText(res, 400, "Bad Request");
    return;
  }

  const requestUrl = getRequestUrl(req);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const publicArticleMatch = pathname.match(/^\/api\/articles\/([^/]+)$/);
  const adminArticleMatch = pathname.match(/^\/api\/admin\/articles\/([^/]+)$/);
  const adminProgressMatch = pathname.match(/^\/api\/admin\/daily-progress\/([^/]+)$/);

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/articles") {
    try {
      const query = normalizeSearchQuery(requestUrl.searchParams.get("q"));
      const categoryFilter = trimTo(requestUrl.searchParams.get("category"), MAX_CP_LENGTH);
      const allPublishedArticles = (await readStoredArticles()).filter((article) => article.published);
      const dailyProgress = await readDailyProgress();
      const searchedArticles = query
        ? allPublishedArticles.filter((article) => matchesSearch(article, query))
        : allPublishedArticles;
      const visibleArticles = categoryFilter
        ? searchedArticles.filter((article) => (article.cp || "未填写 CP") === categoryFilter)
        : searchedArticles;

      sendJson(res, 200, {
        articles: visibleArticles.map(toPublicListView),
        categories: buildCategorySummaries(searchedArticles),
        stats: buildStats(allPublishedArticles),
        dailyProgress: dailyProgress.slice(0, 14).map(toPublicProgressView),
        writingStats: buildWritingStats(dailyProgress),
        search: {
          query,
          resultCount: searchedArticles.length
        }
      });
    } catch (error) {
      sendJson(res, 500, { error: "读取文章失败。", details: error.message });
    }
    return;
  }

  if (req.method === "GET" && publicArticleMatch) {
    try {
      const reference = publicArticleMatch[1];
      const allPublishedArticles = (await readStoredArticles()).filter((article) => article.published);
      const article = findArticleByReference(allPublishedArticles, reference);

      if (!article) {
        sendJson(res, 404, { error: "文章不存在，或还未公开。" });
        return;
      }

      const relatedArticles = allPublishedArticles
        .filter(
          (candidate) =>
            candidate.id !== article.id &&
            (candidate.cp || "未填写 CP") === (article.cp || "未填写 CP")
        )
        .slice(0, 5);

      sendJson(res, 200, {
        article: toPublicDetailView(article),
        relatedArticles: relatedArticles.map(toPublicListView),
        categorySummary: buildCategorySummaries(allPublishedArticles).find(
          (summary) => summary.name === article.fandom
        )
      });
    } catch (error) {
      sendJson(res, 500, { error: "读取文章详情失败。", details: error.message });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    if (!ADMIN_UI_ENABLED) {
      sendText(res, 404, "Not Found");
      return;
    }

    sendJson(res, 200, {
      authenticated: Boolean(getAuthenticatedSession(req)),
      usingDefaultPassword: USING_DEFAULT_PASSWORD
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    if (!ADMIN_UI_ENABLED) {
      sendText(res, 404, "Not Found");
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");

      if (!isValidPassword(payload.password)) {
        sendJson(res, 401, { error: "密码不正确。" });
        return;
      }

      const token = createSession();
      sendJson(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": createSessionCookie(token)
        }
      );
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 422;
      sendJson(res, statusCode, { error: error.message || "登录失败。" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    if (!ADMIN_UI_ENABLED) {
      sendText(res, 404, "Not Found");
      return;
    }

    const auth = getAuthenticatedSession(req);
    if (auth) {
      sessions.delete(auth.token);
    }

    sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": clearSessionCookie()
      }
    );
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/articles") {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const articles = await readStoredArticles();
      sendJson(res, 200, {
        articles: articles.map(toAdminArticleView),
        categories: buildCategorySummaries(articles)
      });
    } catch (error) {
      sendJson(res, 500, { error: "读取后台文章失败。", details: error.message });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/daily-progress") {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const entries = await readDailyProgress();
      sendJson(res, 200, {
        entries: entries.map(toPublicProgressView),
        summary: buildWritingStats(entries)
      });
    } catch (error) {
      sendJson(res, 500, { error: "读取码字记录失败。", details: error.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/articles") {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");
      const article = await createArticle(payload);
      sendJson(res, 201, { article: toAdminArticleView(article) });
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 422;
      sendJson(res, statusCode, { error: error.message || "发布失败。" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/daily-progress") {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");
      const entry = await upsertDailyProgress(payload);
      sendJson(res, 200, { entry: toPublicProgressView(entry) });
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 422;
      sendJson(res, statusCode, { error: error.message || "保存码字记录失败。" });
    }
    return;
  }

  if (req.method === "PUT" && adminArticleMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");
      const article = await updateArticle(adminArticleMatch[1], payload);
      sendJson(res, 200, { article: toAdminArticleView(article) });
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 422;
      sendJson(res, statusCode, { error: error.message || "更新文章失败。" });
    }
    return;
  }

  if (req.method === "PATCH" && adminArticleMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");
      const article = await updateArticlePublication(
        adminArticleMatch[1],
        parseBoolean(payload.published)
      );
      sendJson(res, 200, { article: toAdminArticleView(article) });
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 422;
      sendJson(res, statusCode, { error: error.message || "更新状态失败。" });
    }
    return;
  }

  if (req.method === "DELETE" && adminArticleMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const article = await deleteArticle(adminArticleMatch[1]);
      sendJson(res, 200, { ok: true, id: article.id });
    } catch (error) {
      sendJson(res, 422, { error: error.message || "删除文章失败。" });
    }
    return;
  }

  if (req.method === "DELETE" && adminProgressMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      await deleteDailyProgress(adminProgressMatch[1]);
      sendJson(res, 200, { ok: true, date: adminProgressMatch[1] });
    } catch (error) {
      sendJson(res, 422, { error: error.message || "删除码字记录失败。" });
    }
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
}

async function start() {
  await ensureDataDir();

  if (USING_DEFAULT_PASSWORD) {
    console.warn("警告: 当前使用默认后台密码 change-this-password，请在启动前设置 ADMIN_PASSWORD。");
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(res, 500, { error: "服务器内部错误。", details: error.message });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`Lyra 同人站已启动: http://localhost:${PORT}`);
    console.log(`后台入口: http://localhost:${PORT}/admin`);
  });
}

start().catch((error) => {
  console.error("启动失败:", error);
  process.exitCode = 1;
});
