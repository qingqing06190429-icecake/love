const detailBoard = document.querySelector("#detail-board");
const detailCategory = document.querySelector("#detail-category");
const detailTags = document.querySelector("#detail-tags");
const detailTitle = document.querySelector("#detail-title");
const detailMeta = document.querySelector("#detail-meta");
const detailExcerpt = document.querySelector("#detail-excerpt");
const detailContent = document.querySelector("#detail-content");
const relatedSummary = document.querySelector("#related-summary");
const relatedList = document.querySelector("#related-list");
const relatedItemTemplate = document.querySelector("#related-item-template");

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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

  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = `#${tag}`;
    list.append(chip);
  });

  return list;
}

function getPermalinkFromLocation() {
  const pathname = decodeURIComponent(window.location.pathname);
  const prefix = "/article/";

  if (!pathname.startsWith(prefix) || pathname.length <= prefix.length) {
    return "";
  }

  return pathname.slice(prefix.length);
}

function createRelatedItem(article) {
  const fragment = relatedItemTemplate.content.cloneNode(true);
  const link = fragment.querySelector(".related-item");
  const category = fragment.querySelector(".related-item-category");
  const title = fragment.querySelector(".related-item-title");
  const meta = fragment.querySelector(".related-item-meta");

  link.href = `/article/${encodeURIComponent(article.permalink)}`;
  category.textContent = article.fandom;
  title.textContent = article.title;
  meta.textContent = `更新于 ${formatDate(article.updatedAt)}`;

  return fragment;
}

function renderRelatedArticles(articles, cp) {
  relatedList.innerHTML = "";

  if (!articles.length) {
    relatedList.append(buildEmptyState("这个 CP 分类暂时没有其他公开文章。"));
    relatedSummary.textContent = `「${cp}」分类目前只有这一篇公开文章。`;
    return;
  }

  articles.forEach((article) => {
    relatedList.append(createRelatedItem(article));
  });

  relatedSummary.textContent = `你正在浏览「${cp}」分类，下面是同 CP 的其他公开文章。`;
}

async function loadArticle() {
  const permalink = getPermalinkFromLocation();

  if (!permalink) {
    detailTitle.textContent = "文章路径无效";
    detailMeta.textContent = "当前地址无法定位到文章。";
    detailExcerpt.textContent = "请返回首页重新选择文章。";
    detailContent.innerHTML = "";
    detailContent.append(buildEmptyState("无效的文章路径。"));
    relatedList.innerHTML = "";
    relatedList.append(buildEmptyState("没有可显示的推荐内容。"));
    return;
  }

  try {
    const response = await fetch(`/api/articles/${encodeURIComponent(permalink)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "读取文章详情失败");
    }

    const { article, relatedArticles } = payload;
    document.title = `${article.title} | 青花酒`;
    detailBoard.textContent = article.cp || "未填写 CP";
    detailCategory.textContent = article.fandom;
    detailTags.replaceWith(createTagList(article.tags, "tag-list detail-tags"));
    detailTitle.textContent = article.title;
    detailMeta.textContent = `发布于 ${formatDate(article.createdAt)} · 最近更新 ${formatDate(article.updatedAt)}`;
    detailExcerpt.textContent = article.excerpt;
    detailContent.textContent = article.content;
    renderRelatedArticles(relatedArticles || [], article.cp || "未填写 CP");
  } catch (error) {
    detailTitle.textContent = "这篇文章暂时无法阅读";
    detailMeta.textContent = "可能是文章未公开、已删除，或者链接已经变化。";
    detailExcerpt.textContent = error.message || "读取文章详情失败。";
    detailContent.innerHTML = "";
    detailContent.append(buildEmptyState("请返回首页，从文章列表重新进入。"));
    relatedList.innerHTML = "";
    relatedList.append(buildEmptyState("暂时没有相关作品推荐。"));
  }
}

loadArticle();
