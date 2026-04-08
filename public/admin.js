const loginPanel = document.querySelector("#login-panel");
const dashboardPanel = document.querySelector("#dashboard-panel");
const passwordHint = document.querySelector("#password-hint");
const loginForm = document.querySelector("#login-form");
const passwordInput = document.querySelector("#password-input");
const loginButton = document.querySelector("#login-button");
const loginStatus = document.querySelector("#login-status");
const articleForm = document.querySelector("#article-form");
const composerTitle = document.querySelector("#composer-title");
const composerCopy = document.querySelector("#composer-copy");
const titleInput = document.querySelector("#title-input");
const fandomInput = document.querySelector("#fandom-input");
const cpInput = document.querySelector("#cp-input");
const tagsInput = document.querySelector("#tags-input");
const excerptInput = document.querySelector("#excerpt-input");
const contentInput = document.querySelector("#content-input");
const fileInput = document.querySelector("#file-input");
const publishedInput = document.querySelector("#published-input");
const charCount = document.querySelector("#char-count");
const sourceLabel = document.querySelector("#source-label");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const logoutButton = document.querySelector("#logout-button");
const articleStatus = document.querySelector("#article-status");
const librarySummary = document.querySelector("#library-summary");
const adminArticlesList = document.querySelector("#admin-articles-list");
const articleTemplate = document.querySelector("#admin-article-template");
const progressForm = document.querySelector("#progress-form");
const progressDateInput = document.querySelector("#progress-date-input");
const progressWordsInput = document.querySelector("#progress-words-input");
const progressSubmitButton = document.querySelector("#progress-submit-button");
const progressCancelButton = document.querySelector("#progress-cancel-button");
const progressStatus = document.querySelector("#progress-status");
const progressSummary = document.querySelector("#progress-summary");
const progressList = document.querySelector("#progress-list");
const progressItemTemplate = document.querySelector("#progress-item-template");

let currentSourceName = "后台手动创建";
let editingArticleId = "";
let editingProgressDate = "";
let allArticles = [];
let dailyProgress = [];

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
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

function setStatus(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}

function updateCount() {
  charCount.textContent = `${contentInput.value.length} 字`;
}

function setAuthenticated(authenticated) {
  loginPanel.hidden = authenticated;
  dashboardPanel.hidden = !authenticated;
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

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function resetComposer() {
  editingArticleId = "";
  articleForm.reset();
  contentInput.value = "";
  currentSourceName = "后台手动创建";
  sourceLabel.textContent = `来源：${currentSourceName}`;
  composerTitle.textContent = "发布新文章";
  composerCopy.textContent = "可以直接写文，也可以先导入 txt 文件，再填写原作、CP 和 tag。";
  submitButton.textContent = "保存文章";
  cancelEditButton.hidden = true;
  updateCount();
}

function fillComposer(article) {
  editingArticleId = article.id;
  composerTitle.textContent = `编辑文章：${article.title}`;
  composerCopy.textContent = "你正在修改一篇已有文章，保存后会覆盖原内容并更新时间。";
  submitButton.textContent = "更新文章";
  cancelEditButton.hidden = false;

  titleInput.value = article.title;
  fandomInput.value = article.fandom;
  cpInput.value = article.cp;
  tagsInput.value = article.tags.join(", ");
  excerptInput.value = article.excerpt;
  contentInput.value = article.content;
  publishedInput.checked = article.published;
  currentSourceName = article.sourceName || "后台手动创建";
  sourceLabel.textContent = `来源：${currentSourceName}`;
  updateCount();
  articleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProgressForm() {
  editingProgressDate = "";
  progressForm.reset();
  progressDateInput.value = todayValue();
  progressSubmitButton.textContent = "保存码字记录";
  progressCancelButton.hidden = true;
}

function fillProgressForm(entry) {
  editingProgressDate = entry.date;
  progressDateInput.value = entry.date;
  progressWordsInput.value = String(entry.words);
  progressSubmitButton.textContent = "更新码字记录";
  progressCancelButton.hidden = false;
  progressForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function togglePublication(article, button) {
  button.disabled = true;

  try {
    const response = await fetch(`/api/admin/articles/${article.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        published: !article.published
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "更新状态失败");
    }

    setStatus(articleStatus, article.published ? "文章已转为隐藏。" : "文章已公开发布。");
    await loadAdminArticles();
  } catch (error) {
    setStatus(articleStatus, error.message || "更新状态失败。", true);
  } finally {
    button.disabled = false;
  }
}

async function removeArticle(article, button) {
  if (!window.confirm(`确定要删除《${article.title}》吗？删除后不能恢复。`)) {
    return;
  }

  button.disabled = true;

  try {
    const response = await fetch(`/api/admin/articles/${article.id}`, {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "删除失败");
    }

    if (editingArticleId === article.id) {
      resetComposer();
    }

    setStatus(articleStatus, "文章已删除。");
    await loadAdminArticles();
  } catch (error) {
    setStatus(articleStatus, error.message || "删除失败。", true);
  } finally {
    button.disabled = false;
  }
}

async function removeProgress(entry, button) {
  if (!window.confirm(`确定要删除 ${formatDayLabel(entry.date)} 的码字记录吗？`)) {
    return;
  }

  button.disabled = true;

  try {
    const response = await fetch(`/api/admin/daily-progress/${encodeURIComponent(entry.date)}`, {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "删除失败");
    }

    if (editingProgressDate === entry.date) {
      resetProgressForm();
    }

    setStatus(progressStatus, "码字记录已删除。");
    await loadDailyProgress();
  } catch (error) {
    setStatus(progressStatus, error.message || "删除失败。", true);
  } finally {
    button.disabled = false;
  }
}

function createAdminArticleCard(article) {
  const fragment = articleTemplate.content.cloneNode(true);
  const fandomBadge = fragment.querySelector(".thread-board");
  const cpBadge = fragment.querySelector(".thread-category");
  const statusChip = fragment.querySelector(".status-chip");
  const title = fragment.querySelector(".article-title");
  const meta = fragment.querySelector(".article-meta");
  const excerpt = fragment.querySelector(".article-excerpt");
  const tagList = fragment.querySelector(".admin-tag-list");
  const content = fragment.querySelector(".article-content");
  const readToggle = fragment.querySelector(".article-toggle");
  const detailLink = fragment.querySelector(".detail-link");
  const editButton = fragment.querySelector(".edit-button");
  const publishToggle = fragment.querySelector(".publish-toggle");
  const deleteButton = fragment.querySelector(".delete-button");

  fandomBadge.textContent = article.cp || "未填写 CP";
  cpBadge.textContent = article.fandom;
  statusChip.textContent = article.published ? "已公开" : "草稿";
  statusChip.classList.toggle("is-published", article.published);
  title.textContent = article.title;
  meta.textContent = `${formatDate(article.createdAt)} 创建 · ${formatDate(article.updatedAt)} 更新`;
  excerpt.textContent = article.excerpt;
  tagList.replaceWith(createTagList(article.tags, "tag-list admin-tag-list"));
  content.textContent = article.content;
  publishToggle.textContent = article.published ? "改为隐藏" : "立即公开";

  readToggle.addEventListener("click", () => {
    const shouldShow = content.hidden;
    content.hidden = !shouldShow;
    readToggle.textContent = shouldShow ? "收起正文" : "展开正文";
  });

  editButton.addEventListener("click", () => {
    fillComposer(article);
    setStatus(articleStatus, "已载入文章内容，你可以直接修改并保存。");
  });

  publishToggle.addEventListener("click", () => {
    togglePublication(article, publishToggle);
  });

  deleteButton.addEventListener("click", () => {
    removeArticle(article, deleteButton);
  });

  if (article.published) {
    detailLink.href = `/article/${encodeURIComponent(article.permalink)}`;
  } else {
    detailLink.removeAttribute("href");
    detailLink.classList.add("is-disabled");
    detailLink.textContent = "未公开";
  }

  return fragment;
}

function renderAdminArticles() {
  adminArticlesList.innerHTML = "";

  if (!allArticles.length) {
    adminArticlesList.append(buildEmptyState("还没有文章，先写下第一篇吧。"));
    librarySummary.textContent = "文章库目前为空。";
    return;
  }

  allArticles.forEach((article) => {
    adminArticlesList.append(createAdminArticleCard(article));
  });

  const publishedCount = allArticles.filter((article) => article.published).length;
  const cpCount = new Set(allArticles.map((article) => article.cp || "未填写 CP")).size;
  librarySummary.textContent = `共 ${allArticles.length} 篇文章，分布在 ${cpCount} 个 CP 分类，其中 ${publishedCount} 篇已公开，${allArticles.length - publishedCount} 篇仍为草稿。`;
}

function createProgressItem(entry) {
  const fragment = progressItemTemplate.content.cloneNode(true);
  const date = fragment.querySelector(".progress-date");
  const meta = fragment.querySelector(".progress-meta");
  const words = fragment.querySelector(".progress-words");
  const editButton = fragment.querySelector(".progress-edit-button");
  const deleteButton = fragment.querySelector(".progress-delete-button");

  date.textContent = formatDayLabel(entry.date);
  meta.textContent = `最后更新于 ${formatDate(entry.updatedAt)}`;
  words.textContent = formatWords(entry.words);

  editButton.addEventListener("click", () => {
    fillProgressForm(entry);
    setStatus(progressStatus, "已载入码字记录，你可以直接修改并保存。");
  });

  deleteButton.addEventListener("click", () => {
    removeProgress(entry, deleteButton);
  });

  return fragment;
}

function renderDailyProgress(summary) {
  progressList.innerHTML = "";

  if (!dailyProgress.length) {
    progressList.append(buildEmptyState("还没有日度码字记录。先保存第一天的数据吧。"));
    progressSummary.textContent = "当前还没有登记过码字数。";
    return;
  }

  dailyProgress.forEach((entry) => {
    progressList.append(createProgressItem(entry));
  });

  progressSummary.textContent = `已记录 ${summary.trackedDays || 0} 天，累计 ${formatWords(summary.totalWords || 0)}。`;
}

async function loadAdminArticles() {
  const response = await fetch("/api/admin/articles");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "读取后台文章失败");
  }

  allArticles = payload.articles || [];
  renderAdminArticles();
}

async function loadDailyProgress() {
  const response = await fetch("/api/admin/daily-progress");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "读取日度码字记录失败");
  }

  dailyProgress = payload.entries || [];
  renderDailyProgress(payload.summary || {});
}

async function checkSession() {
  try {
    const response = await fetch("/api/admin/session");
    const payload = await response.json();

    passwordHint.hidden = !payload.usingDefaultPassword;
    setAuthenticated(Boolean(payload.authenticated));

    if (payload.authenticated) {
      await Promise.all([loadAdminArticles(), loadDailyProgress()]);
    }
  } catch (error) {
    setStatus(loginStatus, "无法确认后台状态，请刷新页面重试。", true);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginButton.disabled = true;
  setStatus(loginStatus, "正在验证密码...");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: passwordInput.value
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "登录失败");
    }

    passwordInput.value = "";
    setStatus(loginStatus, "");
    setAuthenticated(true);
    await Promise.all([loadAdminArticles(), loadDailyProgress()]);
  } catch (error) {
    setStatus(loginStatus, error.message || "登录失败。", true);
  } finally {
    loginButton.disabled = false;
  }
}

async function handleFileChange() {
  const [file] = fileInput.files;
  if (!file) {
    sourceLabel.textContent = `来源：${currentSourceName}`;
    return;
  }

  if (!file.name.toLowerCase().endsWith(".txt") && file.type !== "text/plain") {
    setStatus(articleStatus, "目前只支持导入 txt 文本文件。", true);
    fileInput.value = "";
    sourceLabel.textContent = `来源：${currentSourceName}`;
    return;
  }

  try {
    const text = await file.text();
    contentInput.value = text;
    currentSourceName = file.name;
    sourceLabel.textContent = `来源：${currentSourceName}`;
    updateCount();

    if (!titleInput.value.trim()) {
      titleInput.value = file.name.replace(/\.txt$/i, "");
    }

    setStatus(articleStatus, "已读取 txt 文件内容，可以继续编辑后保存。");
  } catch (error) {
    setStatus(articleStatus, "读取文件失败，请重新选择。", true);
  }
}

async function handleArticleSubmit(event) {
  event.preventDefault();

  const content = contentInput.value.trim();
  if (!content) {
    setStatus(articleStatus, "请先填写正文内容。", true);
    return;
  }

  submitButton.disabled = true;
  setStatus(articleStatus, editingArticleId ? "正在更新文章..." : "正在保存文章...");

  try {
    const url = editingArticleId ? `/api/admin/articles/${editingArticleId}` : "/api/admin/articles";
    const method = editingArticleId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: titleInput.value.trim(),
        fandom: fandomInput.value.trim(),
        cp: cpInput.value.trim(),
        tags: tagsInput.value.trim(),
        excerpt: excerptInput.value.trim(),
        content,
        sourceName: currentSourceName,
        published: publishedInput.checked
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "保存文章失败");
    }

    setStatus(
      articleStatus,
      editingArticleId
        ? "文章已更新。"
        : publishedInput.checked
          ? "文章已保存并公开。"
          : "草稿已保存，当前未公开。"
    );
    resetComposer();
    await loadAdminArticles();
  } catch (error) {
    setStatus(articleStatus, error.message || "保存文章失败。", true);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleProgressSubmit(event) {
  event.preventDefault();

  if (!progressDateInput.value) {
    setStatus(progressStatus, "请先选择日期。", true);
    return;
  }

  if (progressWordsInput.value === "") {
    setStatus(progressStatus, "请先填写码字数。", true);
    return;
  }

  progressSubmitButton.disabled = true;
  setStatus(progressStatus, editingProgressDate ? "正在更新码字记录..." : "正在保存码字记录...");

  try {
    const response = await fetch("/api/admin/daily-progress", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: progressDateInput.value,
        words: progressWordsInput.value
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "保存码字记录失败");
    }

    setStatus(progressStatus, editingProgressDate ? "码字记录已更新。" : "码字记录已保存。");
    resetProgressForm();
    await loadDailyProgress();
  } catch (error) {
    setStatus(progressStatus, error.message || "保存码字记录失败。", true);
  } finally {
    progressSubmitButton.disabled = false;
  }
}

async function handleLogout() {
  logoutButton.disabled = true;

  try {
    await fetch("/api/admin/logout", {
      method: "POST"
    });
    setAuthenticated(false);
    adminArticlesList.innerHTML = "";
    progressList.innerHTML = "";
    librarySummary.textContent = "已退出后台。";
    progressSummary.textContent = "已退出后台。";
    setStatus(articleStatus, "");
    setStatus(progressStatus, "");
    resetComposer();
    resetProgressForm();
  } finally {
    logoutButton.disabled = false;
  }
}

loginForm.addEventListener("submit", handleLogin);
articleForm.addEventListener("submit", handleArticleSubmit);
progressForm.addEventListener("submit", handleProgressSubmit);
fileInput.addEventListener("change", handleFileChange);
logoutButton.addEventListener("click", handleLogout);
cancelEditButton.addEventListener("click", () => {
  resetComposer();
  setStatus(articleStatus, "已退出编辑状态。");
});
progressCancelButton.addEventListener("click", () => {
  resetProgressForm();
  setStatus(progressStatus, "已退出编辑状态。");
});
contentInput.addEventListener("input", updateCount);

updateCount();
resetComposer();
resetProgressForm();
checkSession();
