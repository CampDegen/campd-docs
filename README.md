# CampD-Docs

A **Markdown viewer** that runs on **GitHub Pages**. No backend, no config. Add **GitHub repo** URLs; the app fetches content from the GitHub API. You can only add repos you can see—public repos work as-is; for private repos add a token (stored only in your browser). Each person’s sources are stored in their own browser.

---

## Layout

- **Repo root** — Static app: `index.html`, `app.js`, `style.css`.

---

## Run on GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages** → Source: **Deploy from a branch** → Branch **main** (or **master**) → Folder **/ (root)** → Save.
3. Your site is at `https://<user>.github.io/<repo>/`.

---

## How it works

- **Sources** are stored in the browser (localStorage).
- **Content** is fetched from GitHub’s API: `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` with `Accept: application/vnd.github.raw`.
- **Public repos:** no token. **Private repos:** enter a personal access token when adding the source; it’s stored only in that browser.
- **URLs:** `#/` = list and add sources; `#/s/{sourceId}/path/to/doc` = show a doc. Optional **subdir** (e.g. `docs/`) when adding a source.

**Rate limits:** Unauthenticated requests are limited (60/hour). For more traffic, add a [GitHub token](https://github.com/settings/tokens) with no scopes when adding the source (5000/hour).

---

## Local development

```powershell
.\serve.ps1
```

Then open `http://localhost:8080/#/`.
