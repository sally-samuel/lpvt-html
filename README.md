# LPV Technologies - HTML / CSS / Bootstrap / JavaScript + Sanity

Plain static site. No Astro, no Netlify, no build step. Hosted on GitHub Pages.

## How Sanity is integrated
`js/sanity.js` reads content straight from Sanity's public API in the browser (project/dataset in `js/config.js`).
It uses the same GROQ queries the old site used and converts Portable Text to HTML.

| Page | Content from Sanity |
|---|---|
| /blog/ , /blog/post/?slug=... | articles (list, tags, pagination, author filter, detail) |
| /faq/ | faqs |
| /terms/ , /policy/ | terms, policy |
| /services/ , /services/detail/?slug=... | services |
| /products/ (extra list), /products/detail/?slug=... | products |
| /projects/ , /projects/detail/?slug=... | projects |

Static HTML stays in each page as a fallback (and for the original blog URLs), so pages still show if Sanity is unreachable.
Any `/blog/<slug>/`, `/services/<slug>/` etc. that has no static file is redirected by `404.html` to the matching dynamic page.

### One-time Sanity setting (required)
manage.sanity.io > your project > API > CORS origins > Add origin:
`https://lpvtechnologies.com` and `https://www.lpvtechnologies.com` (no credentials needed). The dataset must be public (it already is).

## Editing content: Sanity Studio
The `lpvtech-studio/` folder holds your schemas. It is only the editor, not part of the website:
```
cd lpvtech-studio && npm install && npx sanity deploy
```
This hosts the Studio free on `<name>.sanity.studio` (not Netlify). Use `npm run dev` from `lpvtech-studio/` to run it locally.
Edits appear on the website immediately (no rebuild or redeploy).

## Deploy on GitHub Pages
1. Push this folder's contents to a GitHub repo root (you can leave `studio/` in; it is ignored by the site).
2. Settings > Pages > Source: "Deploy from a branch", `main`, `/ (root)`.
3. `CNAME` sets lpvtechnologies.com. DNS: A records 185.199.108.153, .109.153, .110.153, .111.153 and `www` CNAME to `<username>.github.io`; tick "Enforce HTTPS".
4. Needs the custom domain (pages use root paths like /css/style.css).

## Preview locally
`python3 -m http.server 8000` then open http://localhost:8000 (add `http://localhost:8000` to Sanity CORS to test live data).

## Still to fill in
- `js/config.js`: counters `modulesK` and `co2M`.
- Add your content in Sanity (FAQs, terms, policy, services, products, projects, articles). Pages show the static text until Sanity returns content.
- Images: `images/_REQUIRED-IMAGES.txt` lists what pages use.
