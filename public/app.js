const articleCount = document.querySelector("#article-count");
const categoryCount = document.querySelector("#board-count");
const tagCount = document.querySelector("#category-count");
const categorySummary = document.querySelector("#board-summary");
const recentSummary = document.querySelector("#recent-summary");
const writingSummary = document.querySelector("#writing-summary");
const searchSummary = document.querySelector("#search-summary");
const feedSummary = document.querySelector("#feed-summary");
const categoryGrid = document.querySelector("#board-grid");
const recentUpdatesList = document.querySelector("#recent-updates-list");
const writingProgressList = document.querySelector("#writing-progress-list");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const clearSearchButton = document.querySelector("#clear-search-button");
const categoryFilterList = document.querySelector("#board-filter-list");
const articleSections = document.querySelector("#board-sections");
const categoryCardTemplate = document.querySelector("#board-card-template");
const categoryFilterTemplate = document.querySelector("#board-filter-template");
const storyRowTemplate = document.querySelector("#thread-row-template");
const recentUpdateTemplate = document.querySelector("#recent-update-template");
const writingProgressTemplate = document.querySelector("#writing-progress-template");

let allArticles = [];
let categorySummaries = [];
let activeCategory = "";
let searchQuery = "";

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatDayLabel(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }
  return `${year}年${month}月${day}日`;
}

function formatWords(value) {
  return `${Number(value || 0).toLocaleString("zh-CN")} 字`;
}

function escapeUrlPart(value) {
  return encodeURIComponent(value);
}

function normalizeSearchQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function syncSearchUrl() {
  const url = new URL(window.location.href);

  if (searchQuery) {
    url.searchParams.set("q", searchQuery);
  } else {
    url.searchParams.delete("q");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function buildEmptyState(message) {
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function createTagList(tags, className = "tag-list") {
  const list = document.createElement("div");
  list.className = className;

  if (!tags.length) {
    return list;
  }

  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = `#${tag}`;
    list.append(chip);
  });

  return list;
}

function groupArticlesByCategory(articles) {
  return articles.reduce((groups, article) => {
    const categoryName = article.cp || "未填写 CP";
    if (!groups.has(categoryName)) {
      groups.set(categoryName, []);
    }
    groups.get(categoryName).push(article);
    return groups;
  }, new Map());
}

function updateStats(stats) {
  articleCount.textContent = String(stats.publishedCount || 0);
  categoryCount.textContent = String(stats.categoryCount || 0);
  tagCount.textContent = String(stats.tagCount || 0);
}

function createCategoryCard(summary) {
  const fragment = categoryCardTemplate.content.cloneNode(true);
  const button = fragment.querySelector(".board-card");
  const title = fragment.querySelector(".board-card-title");
  const count = fragment.querySelector(".board-card-count");
  const meta = fragment.querySelector(".board-card-meta");
  const latest = fragment.querySelector(".board-card-latest");

  title.textContent = summary.name;
  count.textContent = `${summary.count} 篇`;
  meta.textContent = summary.fandoms.length
    ? `涉及原作：${summary.fandoms.join(" / ")}`
    : "暂时还没有填写原作";
  latest.textContent = `最近更新：${summary.latestTitle} · ${formatDate(summary.latestUpdatedAt)}`;
  button.classList.toggle("is-active", activeCategory === summary.name);

  button.addEventListener("click", () => {
    activeCategory = activeCategory === summary.name ? "" : summary.name;
    renderCategoryGrid();
    renderCategoryFilters();
    renderArticleSections();
  });

  return fragment;
}

function renderCategoryGrid() {
  categoryGrid.innerHTML = "";

  if (!categorySummaries.length) {
    categoryGrid.append(buildEmptyState("还没有公开分类。发布第一篇文章后，这里会出现 CP 分类。"));
    categorySummary.textContent = searchQuery
      ? `没有找到和“${searchQuery}”相关的 CP 分类。`
      : "当前没有公开分类。";
    return;
  }

  categorySummaries.forEach((summary) => {
    categoryGrid.append(createCategoryCard(summary));
  });

  if (searchQuery) {
    categorySummary.textContent = activeCategory
      ? `搜索“${searchQuery}”后，当前正在查看「${activeCategory}」分类。`
      : `搜索“${searchQuery}”共命中 ${categorySummaries.length} 个 CP 分类。`;
    return;
  }

  categorySummary.textContent = activeCategory
    ? `当前正在查看「${activeCategory}」分类。点击同一卡片可返回全部分类。`
    : `当前共有 ${categorySummaries.length} 个 CP 分类。点击卡片可以只看对应分类。`;
}

function createCategoryFilter(label, categoryName, isActive) {
  const fragment = categoryFilterTemplate.content.cloneNode(true);
  const button = fragment.querySelector(".board-filter");

  button.textContent = label;
  button.classList.toggle("is-active", isActive);
  button.addEventListener("click", () => {
    activeCategory = categoryName;
    renderCategoryGrid();
    renderCategoryFilters();
    renderArticleSections();
  });

  return fragment;
}

function renderCategoryFilters() {
  categoryFilterList.innerHTML = "";
  categoryFilterList.append(createCategoryFilter("全部分类", "", activeCategory === ""));

  categorySummaries.forEach((summary) => {
    categoryFilterList.append(
      createCategoryFilter(`${summary.name} · ${summary.count}`, summary.name, activeCategory === summary.name)
    );
  });
}

function createRecentUpdateItem(article) {
  const fragment = recentUpdateTemplate.content.cloneNode(true);
  const link = fragment.querySelector(".recent-update-item");
  const title = fragment.querySelector(".recent-update-title");
  const meta = fragment.querySelector(".recent-update-meta");
  const time = fragment.querySelector(".recent-update-time");
  const detailUrl = `/article/${escapeUrlPart(article.permalink)}`;
  const metaParts = [article.fandom];

  if (article.cp) {
    metaParts.push(article.cp);
  }

  if (article.tags.length) {
    metaParts.push(article.tags.map((tag) => `#${tag}`).join(" "));
  }

  link.href = detailUrl;
  title.textContent = article.title;
  meta.textContent = metaParts.join(" · ");
  time.textContent = formatDate(article.updatedAt);

  return fragment;
}

function renderRecentUpdates() {
  recentUpdatesList.innerHTML = "";

  if (!allArticles.length) {
    recentUpdatesList.append(buildEmptyState("还没有公开更新。发布文章后，这里会显示最新活动。"));
    recentSummary.textContent = searchQuery
      ? `没有找到和“${searchQuery}”相关的最近更新。`
      : "当前没有可显示的最近更新。";
    return;
  }

  const recentArticles = allArticles.slice(0, 5);
  recentArticles.forEach((article) => {
    recentUpdatesList.append(createRecentUpdateItem(article));
  });

  recentSummary.textContent = searchQuery
    ? `搜索“${searchQuery}”后，最近更新的 ${recentArticles.length} 篇文章在这里。`
    : `这里展示最近更新的 ${recentArticles.length} 篇公开文章。`;
}

function createWritingProgressItem(entry) {
  const fragment = writingProgressTemplate.content.cloneNode(true);
  const date = fragment.querySelector(".writing-progress-date");
  const meta = fragment.querySelector(".writing-progress-meta");
  const words = fragment.querySelector(".writing-progress-words");

  date.textContent = formatDayLabel(entry.date);
  meta.textContent = `记录更新于 ${formatDate(entry.updatedAt)}`;
  words.textContent = formatWords(entry.words);

  return fragment;
}

function renderWritingProgress(entries, stats) {
  writingProgressList.innerHTML = "";

  if (!entries.length) {
    writingProgressList.append(buildEmptyState("还没有公开的日度码字记录。"));
    writingSummary.textContent = "当前没有可显示的码字数据。";
    return;
  }

  entries.slice(0, 7).forEach((entry) => {
    writingProgressList.append(createWritingProgressItem(entry));
  });

  writingSummary.textContent = `已记录 ${stats.trackedDays || 0} 天，累计 ${formatWords(stats.totalWords || 0)}。`;
}

function renderSearchSummary() {
  searchInput.value = searchQuery;
  clearSearchButton.hidden = !searchQuery;

  if (!searchQuery) {
    searchSummary.textContent = "支持搜索文章名字或 tag。";
    return;
  }

  searchSummary.textContent = `正在显示和“${searchQuery}”相关的文章结果。`;
}

function createStoryRow(article) {
  const fragment = storyRowTemplate.content.cloneNode(true);
  const fandomBadge = fragment.querySelector(".thread-board");
  const cpBadge = fragment.querySelector(".thread-category");
  const titleLink = fragment.querySelector(".thread-title-link");
  const excerpt = fragment.querySelector(".thread-excerpt");
  const tags = fragment.querySelector(".thread-tags");
  const meta = fragment.querySelector(".thread-meta");
  const readLink = fragment.querySelector(".thread-read-link");
  const detailUrl = `/article/${escapeUrlPart(article.permalink)}`;

  fandomBadge.textContent = article.cp || "未填写 CP";
  cpBadge.textContent = article.fandom;
  titleLink.textContent = article.title;
  titleLink.href = detailUrl;
  excerpt.textContent = article.excerpt;
  tags.replaceWith(createTagList(article.tags, "tag-list thread-tags"));
  meta.textContent = `发布 ${formatDate(article.createdAt)} · 更新 ${formatDate(article.updatedAt)}`;
  readLink.href = detailUrl;

  return fragment;
}

function createCategorySection(summary, articles) {
  const section = document.createElement("section");
  section.className = "board-section";

  const head = document.createElement("div");
  head.className = "board-section-head";

  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "board-section-title";
  title.textContent = summary.name;
  const meta = document.createElement("p");
  meta.className = "board-section-meta";
  meta.textContent = summary.fandoms.length
    ? `涉及原作：${summary.fandoms.join(" / ")}`
    : "这个分类下暂时还没有填写原作";
  info.append(title, meta);

  const side = document.createElement("div");
  side.className = "board-section-side";
  side.textContent = `${articles.length} 篇`;

  head.append(info, side);
  section.append(head);

  const list = document.createElement("div");
  list.className = "thread-list";

  articles.forEach((article) => {
    list.append(createStoryRow(article));
  });

  section.append(list);
  return section;
}

function renderArticleSections() {
  articleSections.innerHTML = "";

  const visibleArticles = activeCategory
    ? allArticles.filter((article) => (article.cp || "未填写 CP") === activeCategory)
    : allArticles;

  if (!visibleArticles.length) {
    articleSections.append(
      buildEmptyState(
        searchQuery ? `没有找到和“${searchQuery}”相关的公开文章。` : "这个分类下还没有公开文章。"
      )
    );
    feedSummary.textContent = searchQuery ? "当前搜索没有命中文章。" : "当前没有可显示的文章。";
    return;
  }

  const grouped = groupArticlesByCategory(visibleArticles);
  const visibleSummaries = categorySummaries.filter(
    (summary) => !activeCategory || summary.name === activeCategory
  );

  visibleSummaries.forEach((summary) => {
    const categoryArticles = grouped.get(summary.name) || [];
    if (categoryArticles.length) {
      articleSections.append(createCategorySection(summary, categoryArticles));
    }
  });

  if (searchQuery) {
    feedSummary.textContent = activeCategory
      ? `搜索“${searchQuery}”后，在「${activeCategory}」分类下找到 ${visibleArticles.length} 篇公开文章。`
      : `搜索“${searchQuery}”找到 ${visibleArticles.length} 篇公开文章，分布在 ${visibleSummaries.length} 个分类。`;
    return;
  }

  feedSummary.textContent = activeCategory
    ? `当前正在浏览「${activeCategory}」分类，共 ${visibleArticles.length} 篇公开文章。`
    : `当前共展示 ${visibleArticles.length} 篇公开文章，分布在 ${visibleSummaries.length} 个分类。`;
}

async function loadArticles(query = searchQuery) {
  try {
    const normalizedQuery = normalizeSearchQuery(query);
    const requestUrl = new URL("/api/articles", window.location.origin);

    if (normalizedQuery) {
      requestUrl.searchParams.set("q", normalizedQuery);
    }

    const response = await fetch(requestUrl);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "读取文章失败");
    }

    const previousActiveCategory = activeCategory;
    allArticles = payload.articles || [];
    categorySummaries = payload.categories || [];
    searchQuery = payload.search?.query || normalizedQuery;

    if (
      previousActiveCategory &&
      categorySummaries.some((summary) => summary.name === previousActiveCategory)
    ) {
      activeCategory = previousActiveCategory;
    } else {
      activeCategory = "";
    }

    syncSearchUrl();
    updateStats(payload.stats || {});
    renderSearchSummary();
    renderCategoryGrid();
    renderRecentUpdates();
    renderWritingProgress(payload.dailyProgress || [], payload.writingStats || {});
    renderCategoryFilters();
    renderArticleSections();
  } catch (error) {
    categoryGrid.innerHTML = "";
    recentUpdatesList.innerHTML = "";
    writingProgressList.innerHTML = "";
    articleSections.innerHTML = "";
    categoryGrid.append(buildEmptyState("公开分类读取失败，请稍后刷新再试。"));
    recentUpdatesList.append(buildEmptyState("最近更新读取失败，请稍后刷新再试。"));
    writingProgressList.append(buildEmptyState("日度码字记录读取失败，请稍后刷新再试。"));
    articleSections.append(buildEmptyState("公开文章读取失败，请稍后刷新再试。"));
    searchSummary.textContent = "搜索暂时不可用，请稍后刷新再试。";
    categorySummary.textContent = "读取分类失败。";
    recentSummary.textContent = "读取最近更新失败。";
    writingSummary.textContent = "读取日度码字数据失败。";
    feedSummary.textContent = "读取文章失败。";
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadArticles(searchInput.value);
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  loadArticles("");
});

searchQuery = normalizeSearchQuery(new URLSearchParams(window.location.search).get("q"));
renderSearchSummary();
loadArticles(searchQuery);
