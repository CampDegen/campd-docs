(function () {
  "use strict";

  const STORAGE_KEY = "docs_sources";
  const DEFAULT_PATH = "index";
  const GITHUB_API = "https://api.github.com";

  function getPathFromHash() {
    const hash = window.location.hash.slice(1);
    return hash.replace(/^\/+|\/+$/g, "").trim() || DEFAULT_PATH;
  }

  function parseRoute(path) {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "s" && parts.length >= 2) {
      return { type: "source", sourceId: parts[1], docPath: parts.slice(2).join("/") || DEFAULT_PATH };
    }
    return { type: "landing" };
  }

  function getSources() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function setSources(sources) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }

  /** Parse GitHub repo URL to { owner, repo }. */
  function parseGitHubUrl(url) {
    const s = (url || "").trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      if (!/^(https?:\/\/)?(www\.)?github\.com$/i.test(u.origin)) return null;
      const parts = u.pathname.replace(/^\/+|\/+$|\.git$/g, "").split("/").filter(Boolean);
      if (parts.length < 2) return null;
      return { owner: parts[0], repo: parts[1] };
    } catch {
      return null;
    }
  }

  function slugId(name, owner, repo) {
    const slug = (name || owner + "/" + repo).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "src";
    let id = slug;
    let n = 0;
    const sources = getSources();
    while (sources.some((s) => s.id === id)) id = slug + (++n);
    return id;
  }

  function sanitizePath(path) {
    return path
      .replace(/\.\./g, "")
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "")
      .replace(/[^a-zA-Z0-9/\-_.]/g, "");
  }

  function pathToFile(path) {
    const p = sanitizePath(path || DEFAULT_PATH) || DEFAULT_PATH;
    return p.endsWith(".md") ? p : p + ".md";
  }

  function buildContentPath(subdir, filePath) {
    const sub = (subdir || "").trim().replace(/\/+$/, "");
    return sub ? sub + "/" + filePath : filePath;
  }

  /** Fetch file from GitHub (raw). */
  function fetchGitHubFile(owner, repo, ref, path, token) {
    const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
    const headers = { Accept: "application/vnd.github.raw" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(url, { headers }).then((r) => {
      if (!r.ok) throw new Error(r.status === 404 ? "Not found" : r.status === 401 ? "Unauthorized (check token)" : "Request failed");
      return r.text();
    });
  }

  function getSourceById(sourceId) {
    return getSources().find((s) => s.id === sourceId);
  }

  function fetchMarkdown(sourceId, docPath) {
    const src = getSourceById(sourceId);
    if (!src) return Promise.reject(new Error("Source not found"));
    const filePath = pathToFile(docPath);
    const contentPath = buildContentPath(src.subdir, filePath);
    return fetchGitHubFile(src.owner, src.repo, src.ref || "HEAD", contentPath, src.token || null);
  }

  function renderMarkdown(md) {
    return DOMPurify.sanitize(marked.parse(md), {
      ALLOWED_TAGS: ["h1","h2","h3","h4","h5","h6","p","br","a","ul","ol","li","code","pre","blockquote","strong","em","hr","table","thead","tbody","tr","th","td"],
      ALLOWED_ATTR: ["href"]
    });
  }

  function wrapContentBlocks(el) {
    const children = Array.from(el.children);
    if (children.length === 0) return;
    const fragment = document.createDocumentFragment();
    let currentBlock = null;
    for (const child of children) {
      const level = /^H([1-6])$/i.test(child.tagName) ? parseInt(child.tagName[1], 10) : 0;
      if (level > 0) {
        if (currentBlock) fragment.appendChild(currentBlock);
        currentBlock = document.createElement("div");
        currentBlock.className = "doc-block doc-block-" + level;
        currentBlock.appendChild(child);
      } else {
        if (!currentBlock) {
          currentBlock = document.createElement("div");
          currentBlock.className = "doc-block doc-block-1";
        }
        currentBlock.appendChild(child);
      }
    }
    if (currentBlock) fragment.appendChild(currentBlock);
    el.innerHTML = "";
    el.appendChild(fragment);
  }

  function resolveRelativeLink(basePath, href) {
    if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("/")) return href;
    const base = basePath.replace(/\/[^/]*$/, "") || "";
    const segs = (base + "/" + href).split("/").filter(Boolean);
    const out = [];
    for (const s of segs) {
      if (s === "..") out.pop();
      else if (s !== ".") out.push(s);
    }
    return out.join("/").replace(/\.md$/i, "") || DEFAULT_PATH;
  }

  function updateContent(html, context) {
    const el = document.getElementById("content");
    el.innerHTML = html;
    wrapContentBlocks(el);
    const sourceId = context && context.sourceId;
    const basePath = (context && context.docPath) || DEFAULT_PATH;
    el.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (href.startsWith("#/")) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          window.location.hash = href.slice(1);
        });
        return;
      }
      if (sourceId && !href.startsWith("http") && !href.startsWith("mailto:")) {
        const resolved = resolveRelativeLink(basePath, href);
        if (resolved && resolved !== href) {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.hash = "/s/" + sourceId + "/" + resolved;
          });
        }
      }
    });
  }

  function showError(msg) {
    updateContent(`<div class="error"><p><strong>Error</strong></p><p>${DOMPurify.sanitize(msg)}</p><p><a href="#/">Go home</a></p></div>`);
  }

  function loadLandingPage() {
    const sources = getSources();
    let html = "<h1>Docs</h1>";
    if (sources.length > 0) {
      html += "<p>Your sources (stored in this browser):</p><ul class=\"source-list\">" +
        sources.map((s) => "<li><a href=\"#/s/" + s.id + "/\">" + DOMPurify.sanitize(s.name) + "</a> <span class=\"status\">(" + (s.owner + "/" + s.repo) + ")</span></li>").join("") +
        "</ul>";
    } else {
      html += "<p>No sources yet. Add a GitHub repo below. You can only add repos you have access to (public, or private with a token).</p>";
    }
    html += "<hr/><details open><summary>Add source</summary><form id=\"add-source-form\" style=\"margin-top:1rem\">" +
      "<p><label>Name <input type=\"text\" name=\"name\" placeholder=\"My docs\" required></label></p>" +
      "<p><label>GitHub repo URL <input type=\"url\" name=\"repo_url\" placeholder=\"https://github.com/owner/repo\" required></label></p>" +
      "<p><label>Branch <input type=\"text\" name=\"default_ref\" value=\"main\" placeholder=\"main\"></label></p>" +
      "<p><label>Subdir (optional) <input type=\"text\" name=\"subdir_root\" placeholder=\"docs/\"></label></p>" +
      "<p><label>Token (optional, for private repos) <input type=\"password\" name=\"pat\" placeholder=\"leave empty for public repos\" autocomplete=\"off\"></label></p>" +
      "<p><button type=\"submit\">Add source</button></p></form></details>";
    updateContent(html);

    const form = document.getElementById("add-source-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const repoUrl = fd.get("repo_url");
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
          showError("Not a valid GitHub repo URL (e.g. https://github.com/owner/repo).");
          return;
        }
        const name = (fd.get("name") || parsed.owner + "/" + parsed.repo).trim();
        const ref = (fd.get("default_ref") || "main").trim() || "main";
        const subdir = (fd.get("subdir_root") || "").trim().replace(/^\/+|\/+$/g, "");
        const token = (fd.get("pat") || "").trim() || null;
        const id = slugId(name, parsed.owner, parsed.repo);
        const newSource = { id, name, owner: parsed.owner, repo: parsed.repo, ref, subdir, token };
        const sources = getSources();
        if (sources.some((s) => s.id === id)) {
          showError("A source with that id already exists.");
          return;
        }
        sources.push(newSource);
        setSources(sources);
        window.location.hash = "#/s/" + id + "/";
        loadPage();
      });
    }
  }

  function loadSourcePage(sourceId, docPath) {
    const src = getSourceById(sourceId);
    if (!src) {
      showError("Source not found. <a href=\"#/\">Go home</a>.");
      return;
    }
    fetchMarkdown(sourceId, docPath)
      .then(renderMarkdown)
      .then((html) => updateContent(html, { sourceId, docPath: docPath || DEFAULT_PATH }))
      .catch((err) => showError("Document not found or you don't have access. " + (err.message || "") + " <a href=\"#/s/" + sourceId + "/\">Open source root</a> or <a href=\"#/\">home</a>."));
  }

  function loadPage() {
    const path = getPathFromHash();
    const route = parseRoute(path);
    if (route.type === "landing") {
      loadLandingPage();
      return;
    }
    if (route.type === "source") {
      loadSourcePage(route.sourceId, route.docPath);
    }
  }

  window.addEventListener("hashchange", loadPage);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPage);
  } else {
    loadPage();
  }
})();
