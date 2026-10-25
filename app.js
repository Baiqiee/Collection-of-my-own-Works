(function () {
  "use strict";

  var CFG = window.PORTFOLIO;
  var $ = function (id) { return document.getElementById(id); };

  var grid = $("grid");
  var skeletons = $("skeletons");
  var stateBox = $("state");
  var filterBar = $("filterBar");
  var workCount = $("workCount");
  var syncNote = $("syncNote");
  var heroCount = $("heroCount");
  var heroNote = $("heroNote");
  var detailRoot = $("detailRoot");
  var curtain = $("curtain");
  var splash = $("splash");

  var items = [];
  var activeFilter = "all";
  var itemsReady = Promise.resolve();
  var aboutScrollBound = false;
  var currentView = "home";

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ---------- 工具 ---------- */

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function categoryOf(id) {
    for (var i = 0; i < CFG.categories.length; i++) {
      if (CFG.categories[i].id === id) return CFG.categories[i];
    }
    return { id: id, label: id, color: "#00e5ff" };
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 兜底封面 ---------- */

  function makeCover(name, categoryId) {
    var palettes = {
      game: ["#ff2d95", "#00e5ff", "#a855f7"],
      app: ["#00e5ff", "#a855f7", "#ff2d95"],
      web: ["#a855f7", "#00e5ff", "#c8ff2e"],
      tool: ["#c8ff2e", "#00e5ff", "#a855f7"]
    };
    var h = hash(name);
    var pal = palettes[categoryId] || palettes.game;
    var color = pal[h % pal.length];
    var letter = (name.match(/[a-zA-Z\u4e00-\u9fa5]/) || ["P"])[0].toUpperCase();

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">' +
      '<rect width="640" height="400" fill="#06010f"/>' +
      '<text x="320" y="272" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="230" font-weight="700" ' +
      'fill="' + color + '" fill-opacity="0.2">' + escapeHTML(letter) + "</text></svg>";

    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  /* ---------- 分类 ---------- */

  function guessCategory(repo) {
    var manual = CFG.meta[repo.name];
    if (manual && manual.category) return manual.category;

    var buckets = [
      (repo.name || "").toLowerCase(),
      (repo.topics || []).join(" ").toLowerCase(),
      (repo.description || "").toLowerCase()
    ];

    for (var b = 0; b < buckets.length; b++) {
      var text = buckets[b];
      if (!text) continue;
      for (var r = 0; r < CFG.rules.length; r++) {
        var rule = CFG.rules[r];
        for (var k = 0; k < rule.keywords.length; k++) {
          if (text.indexOf(rule.keywords[k]) !== -1) return rule.id;
        }
      }
    }

    return CFG.languageCategory[repo.language] || "tool";
  }

  function normalize(repo) {
    var manual = CFG.meta[repo.name] || {};
    var category = guessCategory(repo);
    var repoUrl = repo.html_url || "https://github.com/" + CFG.owner + "/" + repo.name;
    var demo = (manual.demo || "").trim();
    if (!demo && repo.homepage && /^https?:/.test(repo.homepage)) demo = repo.homepage.trim();

    var auto = readAutoCache(repo.name);
    return {
      name: repo.name,
      title: manual.title || repo.name,
      desc: manual.desc || repo.description || "这个项目还没有写简介。",
      category: category,
      language: repo.language || "文档",
      updated: repo.updated_at,
      repoUrl: repoUrl,
      demoUrl: demo,
      cover: manual.cover || "",
      /* README 自动抓取：首图当封面、首段当简介；有缓存就先顶上，没有等抓取回来再补 */
      autoCover: auto && auto.cover ? auto.cover : "",
      autoDesc: auto && auto.desc ? auto.desc : "",
      pinned: manual.pinned === true
    };
  }

  /* ---------- 数据 ---------- */

  function fetchWithTimeout(url, opts, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctrl) ctrl.abort();
        reject(new Error("timeout"));
      }, ms);

      var o = {};
      if (opts) for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      if (ctrl) o.signal = ctrl.signal;

      fetch(url, o).then(
        function (res) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(res);
        },
        function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CFG.cacheKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.time || !Array.isArray(parsed.repos)) return null;
      if (Date.now() - parsed.time > CFG.cacheTTL) return null;
      return parsed.repos;
    } catch (e) {
      return null;
    }
  }

  function writeCache(repos) {
    try {
      localStorage.setItem(CFG.cacheKey, JSON.stringify({ time: Date.now(), repos: repos }));
    } catch (e) {}
  }

  function loadRepos() {
    var cached = readCache();
    if (cached) return Promise.resolve({ repos: cached, source: "cache" });

    var url = "https://api.github.com/users/" + CFG.owner + "/repos?per_page=100&sort=updated&t=" + Date.now();

    return fetchWithTimeout(url, { headers: { Accept: "application/vnd.github+json" } }, 6000)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("bad payload");
        writeCache(data);
        return { repos: data, source: "api" };
      })
      .catch(function () {
        return { repos: CFG.snapshot, source: "snapshot" };
      });
  }

  function sortRepos(list) {
    var pinned = list.filter(function (i) { return i.pinned; });
    var rest = list.filter(function (i) { return !i.pinned; });
    rest.sort(function (a, b) { return new Date(b.updated) - new Date(a.updated); });
    return pinned.concat(rest);
  }

  /* ---------- 首页渲染 ---------- */

  function renderFilters() {
    var counts = { all: items.length };
    items.forEach(function (i) { counts[i.category] = (counts[i.category] || 0) + 1; });

    var html = '<button class="filter-btn is-active" data-filter="all" role="tab" aria-selected="true">全部<span class="count">' + items.length + "</span></button>";

    CFG.categories.forEach(function (c) {
      var n = counts[c.id] || 0;
      if (!n) return;
      html += '<button class="filter-btn" data-filter="' + c.id + '" role="tab" aria-selected="false">' + c.label + '<span class="count">' + n + "</span></button>";
    });

    filterBar.innerHTML = html;
  }

  function cardHTML(item, index) {
    var cat = categoryOf(item.category);
    var cover = item.autoCover || item.cover || makeCover(item.name, item.category);
    var pin = item.pinned ? '<span class="card-pin">TOP</span>' : "";
    var play = item.demoUrl ? '<span class="card-demo-tag">可试玩</span>' : "";

    return (
      '<article class="card" data-category="' + item.category + '" data-repo="' + escapeHTML(item.name) + '" style="animation-delay:' + Math.min(index * 60, 420) + 'ms">' +
      '<a class="card-hit" href="#/p/' + encodeURIComponent(item.name) + '" aria-label="查看 ' + escapeHTML(item.title) + ' 详情"></a>' +
      '<div class="card-cover">' +
      '<img class="cover-bg" src="' + escapeHTML(cover) + '" alt="" aria-hidden="true">' +
      '<img class="cover-img" src="' + escapeHTML(cover) + '" alt="' + escapeHTML(item.title) + ' 截图" loading="lazy" data-fallback="' + encodeURIComponent(makeCover(item.name, item.category)) + '">' +
      '<span class="card-tag">' + escapeHTML(cat.label.toUpperCase()) + "</span>" + pin + play +
      "</div>" +
      '<div class="card-body">' +
      '<h3 class="card-title">' + escapeHTML(item.title) + "</h3>" +
      '<a class="card-repo" href="' + escapeHTML(item.repoUrl) + '" target="_blank" rel="noopener" title="' + escapeHTML(item.repoUrl) + '">' +
      '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>' +
      "<span>" + escapeHTML(CFG.owner + "/" + item.name) + "</span></a>" +
      '<p class="card-desc">' + escapeHTML(item.autoDesc || item.desc) + "</p>" +
      '<div class="card-meta">' +
      '<span class="lang-dot" style="background:' + cat.color + ";color:" + cat.color + '"></span>' +
      "<span>" + escapeHTML(item.language) + "</span>" +
      '<span class="meta-sep">/</span>' +
      "<span>" + formatDate(item.updated) + "</span>" +
      '<span class="card-demo">详情 →</span>' +
      "</div></div></article>"
    );
  }

  function bindCoverFallback(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll(".cover-img"), function (img) {
      img.addEventListener("error", function () {
        var fb = img.getAttribute("data-fallback");
        if (!fb) return;
        img.src = decodeURIComponent(fb);
        img.removeAttribute("data-fallback");
      });
    });
  }

  function renderGrid() {
    grid.innerHTML = items.map(cardHTML).join("");
    bindCoverFallback(grid);
    workCount.textContent = items.length;
    heroCount.textContent = items.length;
  }

  function applyFilter(id) {
    activeFilter = id;
    var cards = Array.prototype.slice.call(grid.children);
    var first = new Map();
    cards.forEach(function (c) { first.set(c, c.getBoundingClientRect()); });

    cards.forEach(function (c) {
      c.classList.toggle("is-hidden", !(id === "all" || c.dataset.category === id));
    });

    cards.forEach(function (c) {
      if (c.classList.contains("is-hidden")) return;
      var before = first.get(c);
      var after = c.getBoundingClientRect();
      if (!before || !before.width) {
        c.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(0.22,1,0.36,1)" });
        return;
      }
      var dx = before.left - after.left;
      var dy = before.top - after.top;
      if (dx || dy) {
        c.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.22,1,0.36,1)" });
      }
    });

    Array.prototype.forEach.call(filterBar.children, function (btn) {
      var on = btn.dataset.filter === id;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function showState(title, desc, retry) {
    stateBox.hidden = false;
    stateBox.innerHTML =
      '<p class="state-title">' + escapeHTML(title) + "</p>" +
      '<p class="state-desc">' + escapeHTML(desc) + "</p>" +
      (retry ? '<button class="btn-retry" id="retryBtn">重新加载</button>' : "");
    if (retry) {
      $("retryBtn").addEventListener("click", function () {
        try { localStorage.removeItem(CFG.cacheKey); } catch (e) {}
        location.reload();
      });
    }
  }

  /* ---------- README ---------- */

  function readReadmeCache(name) {
    try {
      var raw = localStorage.getItem("bdq-readme:" + name);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || Date.now() - obj.time > 30 * 60 * 1000) return null;
      return obj;
    } catch (e) { return null; }
  }

  function writeReadmeCache(name, md, branch) {
    try {
      localStorage.setItem("bdq-readme:" + name, JSON.stringify({ time: Date.now(), md: md, branch: branch }));
    } catch (e) {}
  }

  function fetchReadme(name) {
    var cached = readReadmeCache(name);
    if (cached) return Promise.resolve({ md: cached.md, branch: cached.branch });

    var branches = ["main", "master"];

    function attempt(i) {
      if (i >= branches.length) return Promise.reject(new Error("readme failed"));
      var branch = branches[i];
      var url = "https://raw.githubusercontent.com/" + CFG.owner + "/" + name + "/" + branch + "/README.md?t=" + Date.now();
      return fetchWithTimeout(url, null, 6000)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (md) {
          writeReadmeCache(name, md, branch);
          return { md: md, branch: branch };
        })
        .catch(function () { return attempt(i + 1); });
    }

    return attempt(0);
  }

  function sanitizeReadme(box) {
    Array.prototype.forEach.call(box.querySelectorAll("script,style,iframe,object,embed,link,meta,form,input"), function (el) { el.remove(); });
    Array.prototype.forEach.call(box.querySelectorAll("*"), function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        if ((attr.name === "href" || attr.name === "src") && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      });
    });
  }

  function fixReadmeLinks(box, name, branch) {
    var rawBase = "https://raw.githubusercontent.com/" + CFG.owner + "/" + name + "/" + branch + "/";
    var blobBase = "https://github.com/" + CFG.owner + "/" + name + "/blob/" + branch + "/";
    function isAbsolute(u) { return /^(https?:|data:|mailto:|#|\/\/)/i.test(u); }

    Array.prototype.forEach.call(box.querySelectorAll("img"), function (img) {
      var src = img.getAttribute("src");
      if (!src) return;
      if (!isAbsolute(src)) img.setAttribute("src", rawBase + src.replace(/^\.\//, "").replace(/^\//, ""));
      img.setAttribute("loading", "lazy");
    });

    Array.prototype.forEach.call(box.querySelectorAll("a"), function (a) {
      var href = a.getAttribute("href");
      if (!href) return;
      if (!isAbsolute(href)) {
        a.setAttribute("href", blobBase + href.replace(/^\.\//, "").replace(/^\//, ""));
      } else if (/^https?:/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
      }
    });
  }

  function renderMarkdown(box, md, name, branch) {
    if (window.marked && typeof window.marked.parse === "function") {
      box.innerHTML = window.marked.parse(md, { gfm: true, breaks: false, mangle: false, headerIds: false });
    } else {
      box.innerHTML = "<pre class='readme-raw'>" + escapeHTML(md) + "</pre>";
    }
    sanitizeReadme(box);
    fixReadmeLinks(box, name, branch);
  }

  /* ---------- 自动抓取：README 首图当封面 + 首段当简介 ---------- */

  var AUTO_KEY = "bdq-readme-auto-v2:";
  var AUTO_TTL = 24 * 60 * 60 * 1000;   /* 一天更新一次 */
  var AUTO_MAX = 2;                     /* 同时最多抓两个，别把网络挤满 */
  var autoQueue = [];
  var autoActive = 0;

  function readAutoCache(name) {
    try {
      var raw = localStorage.getItem(AUTO_KEY + name);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || Date.now() - (obj.time || 0) > AUTO_TTL) return null;
      return { cover: obj.cover || "", desc: obj.desc || "" };   /* 空字符串也算结果，免得反复请求 */
    } catch (e) { return null; }
  }

  function writeAutoCache(name, data) {
    try {
      localStorage.setItem(AUTO_KEY + name, JSON.stringify({ time: Date.now(), cover: data.cover || "", desc: data.desc || "" }));
    } catch (e) {}
  }

  /* 徽章、图标不算截图 */
  function isBadge(url) {
    return /img\.shields\.io|shields\.io|badgen\.net|badge\.fury|codecov\.io|travis-ci|circleci\.com|appveyor|visitor-badge|komarev\.com|profile-views|\.svg(\?|#|$)/i.test(url);
  }

  /* 从 README 正文里取第一张图；优先静态截图，只有动图时才退回 gif */
  function extractFirstImage(md, name, branch) {
    if (!md) return "";
    var rawBase = "https://raw.githubusercontent.com/" + CFG.owner + "/" + name + "/" + branch + "/";
    var text = md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");

    var defs = {};
    text.replace(/^[ \t]*\[([^\]]+)\]:[ \t]*(\S+)/gm, function (all, id, url) {
      defs[id.toLowerCase()] = url;
      return all;
    });

    var found = [];
    function push(raw) {
      var url = String(raw || "").trim().replace(/^<|>$/g, "").split(/\s+/)[0];
      if (!url || /^javascript:/i.test(url)) return;
      if (/^\/\//.test(url)) url = "https:" + url;
      else if (!/^(https?:|data:)/i.test(url)) url = rawBase + url.replace(/^\.\//, "").replace(/^\/+/, "");
      found.push(url);
    }

    var m;
    var reMd = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
    while ((m = reMd.exec(text))) push(m[1]);

    var reRef = /!\[[^\]]*\]\[([^\]]*)\]/g;
    while ((m = reRef.exec(text))) {
      var key = (m[1] || "").toLowerCase();
      if (defs[key]) push(defs[key]);
    }

    var reImg = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
    while ((m = reImg.exec(text))) push(m[1]);

    var real = found.filter(function (u) { return !isBadge(u); });
    var still = real.filter(function (u) { return !/\.gif(\?|#|$)/i.test(u); });
    return still[0] || real[0] || "";
  }

  /* 去掉 markdown / HTML 标记，留下纯文本 */
  function plainText(s) {
    return String(s || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/!\[[^\]]*\]\[[^\]]*\]/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      .replace(/^[ \t]*>+[ \t]?/gm, "")
      .replace(/^[ \t]*([-*+]|\d+\.)[ \t]+/gm, "")
      .replace(/[*_~]{1,3}/g, "")
      .replace(/`+/g, "")
      .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1")
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, " ")
      .trim();
  }

  function truncate(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n).replace(/[，、,；;：:。\s]+$/, "") + "…";
  }

  /* 取 README 的第一段正经简介：跳过标题、徽章、目录、链接行、表格、代码、纯图 */
  function extractFirstParagraph(md) {
    if (!md) return "";
    var body = md.replace(/<!--[\s\S]*?-->/g, " ").replace(/```[\s\S]*?```/g, "\n\n");

    var blocks = body.split(/\n[ \t]*\n/);
    for (var i = 0; i < blocks.length; i++) {
      var raw = blocks[i].trim();
      if (!raw) continue;
      if (/^#{1,6}\s/.test(raw)) continue;              /* 标题 */
      if (/^([-*_])\1{2,}$/.test(raw)) continue;         /* 分割线 */
      if (/^\|/.test(raw)) continue;                     /* 表格 */
      if (/^<(!|\/?\w+)/.test(raw) && !/[。，、！？；]/.test(raw)) continue;  /* 纯 HTML 块 */
      if (/\]\(/.test(raw)) continue;                    /* 带链接的块（试玩入口之类） */
      if (/<https?:/.test(raw)) continue;                /* 裸链接 */

      var text = plainText(raw);
      if (!text) continue;
      if (/^[\x00-\x7f]+$/.test(text) && !/[a-zA-Z]{4,}/.test(text)) continue;  /* 纯符号 */
      if ((text.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g) || []).length < 12) continue;
      var isAllBold = /^\s*(\*\*|__)[\s\S]+(\*\*|__)\s*$/.test(raw) && (raw.split("**").length <= 3);
      if (isAllBold) continue;                           /* 整段加粗的标语，留作后面的正文 */
      if (/^(作者|版本|日期|license|mit|目录|table of contents)\b/i.test(text)) continue;

      return truncate(text, 160);
    }
    return "";
  }

  /* 换图前先预加载，加载失败就保留旧封面 */
  function swapCover(img, url) {
    if (!img || !url || img.getAttribute("src") === url) return;
    var probe = new Image();
    probe.onload = function () {
      img.classList.add("is-cover-fading");
      setTimeout(function () {
        img.src = url;
        img.removeAttribute("data-fallback");
        img.classList.remove("is-cover-fading");
      }, 170);
    };
    probe.src = url;
  }

  /* 抓到了就换上，卡片和详情页一起更新 */
  function applyAuto(name, data) {
    var item = findItem(name);
    if (item) {
      if (data.cover) item.autoCover = data.cover;
      if (data.desc) item.autoDesc = data.desc;
    }

    var scopes = [grid.querySelector('[data-repo="' + name + '"]'), detailRoot.querySelector('[data-repo="' + name + '"]')];
    scopes.forEach(function (box) {
      if (!box) return;
      if (data.cover) {
        swapCover(box.querySelector(".cover-img"), data.cover);
        swapCover(box.querySelector(".cover-bg"), data.cover);
      }
      if (data.desc) {
        var p = box.querySelector(".card-desc") || box.querySelector(".detail-desc");
        if (p && p.textContent.trim() !== data.desc) p.textContent = data.desc;
      }
    });
  }

  function pumpAuto() {
    while (autoActive < AUTO_MAX && autoQueue.length) {
      var name = autoQueue.shift();
      autoActive++;
      (function (repo) {
        fetchReadme(repo)
          .then(function (res) {
            var data = {
              cover: extractFirstImage(res.md, repo, res.branch),
              desc: extractFirstParagraph(res.md)
            };
            writeAutoCache(repo, data);
            if (data.cover || data.desc) applyAuto(repo, data);
          })
          .catch(function () {})
          .then(function () {
            autoActive--;
            pumpAuto();
          });
      })(name);
    }
  }

  /* 每个作品出现在页面上时排队抓一次（有缓存就直接用，不再请求） */
  function queueAuto() {
    if (CFG.autoCover === false) return;
    autoQueue = [];
    autoActive = 0;
    items.forEach(function (item) {
      var manual = CFG.meta[item.name] || {};
      if (manual.autoCover === false) return;
      var cached = readAutoCache(item.name);
      if (cached !== null) { if (cached.cover || cached.desc) applyAuto(item.name, cached); return; }
      autoQueue.push(item.name);
    });
    pumpAuto();
  }

  /* ---------- 详情页 ---------- */

  function findItem(name) {
    for (var i = 0; i < items.length; i++) if (items[i].name === name) return items[i];
    return null;
  }

  function detailShell(item) {
    var cat = categoryOf(item.category);
    var cover = item.autoCover || item.cover || makeCover(item.name, item.category);
    var playBtn = item.demoUrl
      ? '<a class="btn btn-primary btn-play" href="' + escapeHTML(item.demoUrl) + '" target="_blank" rel="noopener"><span class="play-tri" aria-hidden="true"></span>在线试玩</a>'
      : "";

    return (
      '<div class="detail" data-repo="' + escapeHTML(item.name) + '">' +
      '<a class="back-link" href="#/"><span aria-hidden="true">←</span> 返回作品集</a>' +
      '<div class="detail-hero">' +
      '<div class="detail-cover"><img class="cover-bg" src="' + escapeHTML(cover) + '" alt="" aria-hidden="true">' +
      '<img class="cover-img" src="' + escapeHTML(cover) + '" alt="' + escapeHTML(item.title) + ' 截图" data-fallback="' + encodeURIComponent(makeCover(item.name, item.category)) + '"></div>' +
      '<div class="detail-info">' +
      '<span class="detail-cat">' + escapeHTML(cat.label.toUpperCase()) + "</span>" +
      '<h1 class="detail-title">' + escapeHTML(item.title) + "</h1>" +
      '<p class="detail-desc">' + escapeHTML(item.autoDesc || item.desc) + "</p>" +
      '<div class="detail-meta"><span class="lang-dot" style="background:' + cat.color + ";color:" + cat.color + '"></span>' +
      escapeHTML(item.language) + '<span class="meta-sep">/</span>更新于 ' + formatDate(item.updated) + "</div>" +
      '<div class="detail-actions">' + playBtn +
      '<a class="btn btn-ghost" href="' + escapeHTML(item.repoUrl) + '" target="_blank" rel="noopener">GitHub 仓库 <span class="arrow">↗</span></a>' +
      "</div></div></div>" +
      '<div class="readme-head"><h2>项目说明</h2><span class="readme-source">SOURCE / README</span></div>' +
      '<div class="readme" id="readmeBody"><div class="readme-loading"><span class="spinner"></span>READING README…</div></div>' +
      "</div>"
    );
  }

  function renderDetail(name) {
    detailRoot.innerHTML = '<div class="detail"><a class="back-link" href="#/"><span aria-hidden="true">←</span> 返回作品集</a><div class="readme-loading"><span class="spinner"></span>LOADING…</div></div>';

    itemsReady.then(function () {
      var item = findItem(name);
      if (!item) {
        detailRoot.innerHTML =
          '<div class="detail"><a class="back-link" href="#/"><span aria-hidden="true">←</span> 返回作品集</a>' +
          '<div class="state" style="padding:80px 0"><p class="state-title">找不到这个项目</p><p class="state-desc">它可能还没同步，或者链接不对。</p></div></div>';
        return;
      }

      detailRoot.innerHTML = detailShell(item);
      bindCoverFallback(detailRoot);
      document.title = item.title + " · 白道奇个人作品集";

      var box = $("readmeBody");
      fetchReadme(item.name)
        .then(function (res) { renderMarkdown(box, res.md, item.name, res.branch); })
        .catch(function () {
          box.innerHTML =
            '<div class="readme-error"><p>README 暂时读取不到，可能是网络或接口限流。</p>' +
            '<a class="btn btn-ghost" href="' + escapeHTML(item.repoUrl) + '" target="_blank" rel="noopener">去 GitHub 看 <span class="arrow">↗</span></a></div>';
        });
    });
  }

  /* ---------- 关于页 ---------- */

  function renderSkills() {
    var box = $("skillChips");
    var once = CFG.skills.map(function (s) { return '<span class="chip">' + escapeHTML(s) + "</span>"; }).join("");
    box.innerHTML = once + once;
  }

  function renderStats() {
    if (!items.length) return;
    var cats = {};
    items.forEach(function (i) { cats[i.category] = true; });
    var latest = items.reduce(function (acc, i) { var t = new Date(i.updated).getTime(); return t > acc ? t : acc; }, 0);

    countUp($("statWorks"), items.length);
    countUp($("statCats"), Object.keys(cats).length);
    $("statYear").textContent = latest ? new Date(latest).getFullYear() : "—";
  }

  function countUp(el, target) {
    if (!el) return;
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / 900, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var revealObserver = null;

  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (el) { el.classList.add("is-in"); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            revealObserver.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    }
    Array.prototype.forEach.call(document.querySelectorAll(".reveal:not(.is-in)"), function (el) { revealObserver.observe(el); });
  }

  function initAboutScroll() {
    if (aboutScrollBound) return;
    aboutScrollBound = true;

    var wrapEl = $("ribbonWrap");
    var ribbon = $("ribbonTrack");
    var prog = $("aboutProgress");
    var layers = document.querySelectorAll("#view-about [data-parallax]");
    var ticking = false;

    function update() {
      ticking = false;
      if (currentView !== "about") return;

      var y = window.scrollY;

      Array.prototype.forEach.call(layers, function (el) {
        var f = parseFloat(el.getAttribute("data-parallax")) || 0;
        el.style.transform = "translate3d(0," + (y * f).toFixed(2) + "px,0)";
      });

      if (wrapEl && ribbon) {
        var rect = wrapEl.getBoundingClientRect();
        var p = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        p = Math.max(0, Math.min(1, p));
        ribbon.style.transform = "translate3d(" + (-p * 22).toFixed(2) + "%,0,0)";
      }

      if (prog) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        prog.style.height = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + "%";
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  /* ---------- 转场 ---------- */

  var transTimer = null;

  function runCurtain(kind, apply) {
    if (reducedMotion() || !curtain) { apply(); return; }

    clearTimeout(transTimer);

    curtain.className = "curtain is-on" + (kind === "about" ? " is-blinds" : "");
    void curtain.offsetWidth;
    curtain.classList.add("is-in");

    /* 幕布完全铺满后再切内容、再撤场，避免动画互相覆盖 */
    setTimeout(apply, 360);
    setTimeout(function () { curtain.classList.add("is-out"); }, 400);
    transTimer = setTimeout(function () { curtain.className = "curtain"; }, 1150);
  }

  /* ---------- 路由 ---------- */

  function parseRoute(h) {
    var raw = (h === undefined ? location.hash : h) || "";
    raw = raw.replace(/^#\/?/, "");
    if (raw.indexOf("about") === 0) return { view: "about" };
    if (raw.indexOf("p/") === 0) return { view: "detail", name: decodeURIComponent(raw.slice(2)) };
    return { view: "home" };
  }

  function route(animate) {
    var r = parseRoute();

    var apply = function () {
      currentView = r.view;

      Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) {
        v.classList.toggle("is-active", v.id === "view-" + r.view);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
        a.classList.toggle("is-active", a.dataset.nav === r.view || (r.view === "detail" && a.dataset.nav === "home"));
      });

      window.scrollTo(0, 0);

      if (r.view === "detail") {
        document.title = "项目详情 · 白道奇个人作品集";
        renderDetail(r.name);
      } else if (r.view === "about") {
        document.title = "关于我 · 白道奇个人作品集";
        initReveal();
        renderStats();
        initAboutScroll();
      } else {
        document.title = "白道奇个人作品集";
        applyFilter(activeFilter);
      }
    };

    if (animate) runCurtain(r.view, apply);
    else apply();
  }

  function navigate(hash) {
    if (hash === location.hash) {
      window.scrollTo(0, 0);
      return;
    }
    try {
      history.pushState(null, "", hash);
    } catch (e) {
      location.hash = hash;
    }
    route(true);
  }

  function bindNav() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;

      var href = a.getAttribute("href") || "";
      if (a.target === "_blank") return;

      if (href.indexOf("#/") === 0) {
        e.preventDefault();
        navigate(href);
        return;
      }

      if (href.charAt(0) === "#" && href.length > 1) {
        var target = document.getElementById(href.slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
        }
      }
    });

    window.addEventListener("popstate", function () { route(true); });
    window.addEventListener("hashchange", function () {
      if (parseRoute().view !== currentView) route(true);
    });
  }

  /* ---------- Splash ---------- */

  function runSplash(done) {
    if (!splash) { done(); return; }

    /* 节奏：全息投影 1.5s → 第一下数码闪化 0.3s → 间隙 0.15s → 第二下闪出来就硬切首页 */
    var phase = "loading";
    var timers = [];
    var holdTimer = setTimeout(firstGlitch, 1500);
    timers.push(holdTimer);

    function later(fn, ms) {
      timers.push(setTimeout(fn, ms));
    }

    function finish() {
      if (phase === "done") return;
      phase = "done";
      timers.forEach(clearTimeout);
      if (splash.parentNode) splash.parentNode.removeChild(splash);
      document.body.classList.remove("is-loading");
      done();
    }

    function firstGlitch() {
      if (phase !== "loading") return;
      if (reducedMotion()) { finish(); return; }
      phase = "glitch-1";
      splash.classList.add("is-glitch");
      later(function () {
        splash.classList.remove("is-glitch");
        phase = "gap";
        later(secondGlitch, 150);
      }, 300);
    }

    function secondGlitch() {
      if (phase === "done") return;
      phase = "glitch-2";
      splash.classList.add("is-glitch-2");
      later(finish, 110);   /* 第二下刚闪出来就切，不留淡出 */
    }

    splash.addEventListener("click", function () {
      if (phase !== "loading") return;
      clearTimeout(holdTimer);
      firstGlitch();
    });
  }

  /* ---------- 其他动效 ---------- */

  function initCursor() {
    var glow = $("cursorGlow");
    if (!glow || window.matchMedia("(pointer: coarse)").matches) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

    document.addEventListener("mousemove", function (e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!document.body.classList.contains("has-pointer")) {
        cx = tx; cy = ty;
        document.body.classList.add("has-pointer");
      }
      if (!raf) raf = requestAnimationFrame(tick);
    });

    function tick() {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      glow.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      if (Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5) raf = requestAnimationFrame(tick);
      else raf = null;
    }
  }

  function initNav() {
    var nav = $("nav");
    function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 8); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function avatarFallback() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
      '<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#ff2d95"/><stop offset="0.55" stop-color="#a855f7"/><stop offset="1" stop-color="#00e5ff"/>' +
      "</linearGradient></defs>" +
      '<rect width="240" height="240" fill="url(#a)"/>' +
      '<text x="120" y="160" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="108" font-weight="700" fill="#0a0316">白</text>' +
      "</svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function initAvatar() {
    var img = $("avatar");
    if (!img) return;
    var done = false;

    function fallback() {
      if (done) return;
      done = true;
      img.src = avatarFallback();
    }

    img.addEventListener("error", fallback);
    img.addEventListener("load", function () { if (!img.naturalWidth) fallback(); });
    setTimeout(function () { if (!img.complete || !img.naturalWidth) fallback(); }, 2200);
  }

  /* ---------- 启动 ---------- */

  function paint(list, source) {
    items = sortRepos(
      list.filter(function (r) { return !r.fork && !r.archived && !r.private; }).map(normalize)
    );

    skeletons.style.display = "none";

    if (!items.length) {
      showState("还没有作品", "GitHub 上暂时没有可展示的公开仓库。", true);
      workCount.textContent = "0";
      heroCount.textContent = "0";
      return;
    }

    renderFilters();
    renderGrid();
    applyFilter(activeFilter);
    queueAuto();

    var note = { api: "已同步 GitHub", cache: "", snapshot: "离线数据" };
    setNote(Object.prototype.hasOwnProperty.call(note, source) ? note[source] : "已同步");
    renderStats();

  }

  /* 缓存命中也算同步完成，不再单独挂「缓存数据」的标签 */
  function setNote(text) {
    var empty = !text;
    [heroNote, syncNote].forEach(function (el) {
      if (!el) return;
      el.textContent = text;
      el.hidden = empty;
    });
    var sep = syncNote ? syncNote.previousElementSibling : null;
    if (sep && sep.classList.contains("sep")) sep.hidden = empty;
  }

  function boot() {
    renderSkills();
    initNav();
    initCursor();
    initAvatar();
    bindNav();

    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      applyFilter(btn.dataset.filter);
    });

    paint(CFG.snapshot, "snapshot");
    itemsReady = Promise.resolve();
    route(false);

    runSplash(function () {
      var cards = grid.querySelectorAll(".card");
      Array.prototype.forEach.call(cards, function (c) {
        c.style.animation = "none";
        void c.offsetWidth;
        c.style.animation = "";
      });
    });

    loadRepos().then(function (result) {
      if (result.source === "snapshot") return;
      paint(result.repos, result.source);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
