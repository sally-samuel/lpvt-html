/* LPV Technologies - Sanity integration (vanilla JS, runs in the browser).
 * Reads content straight from Sanity's public HTTP API (CDN), so there is no build step.
 * Needs: window.LPVT_CONFIG.sanity = { projectId, dataset } and the site origin added in
 * Sanity > API > CORS origins. Every renderer keeps the page's static fallback if Sanity fails.
 */
(function () {
  "use strict";
  var S = (window.LPVT_CONFIG || {}).sanity || {};
  var assetUrl = window.LPVT_ASSET_URL || function (path) { return path; };
  var API = "https://" + S.projectId + ".apicdn.sanity.io/v" + (S.apiVersion || "2021-10-21") + "/data/query/" + S.dataset;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^(https?:|mailto:|tel:|\/|#)/i.test(u || "") ? u : "#"; }
  function qs(name) { return new URLSearchParams(location.search).get(name); }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return ""; } }
  function img(url, w) { return url && url.indexOf("cdn.sanity.io") > -1 ? url + (url.indexOf("?") > -1 ? "&" : "?") + "w=" + (w || 900) + "&auto=format" : url; }
  function blogUrl(section, params) {
    var root = window.LPVT_SITE_ROOT || new URL("/", window.location.href);
    var url = new URL("blog/" + (section || ""), root);
    Object.keys(params || {}).forEach(function (key) { url.searchParams.set(key, params[key]); });
    return url.pathname + url.search;
  }

  function fetchQuery(groq, params) {
    var url = API + "?query=" + encodeURIComponent(groq);
    Object.keys(params || {}).forEach(function (k) { url += "&%24" + k + "=" + encodeURIComponent(JSON.stringify(params[k])); });
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Sanity " + r.status);
      return r.json();
    }).then(function (j) { return j.result; });
  }

  /* ---------- GROQ (same queries the original site used) ---------- */
  var Q = {
    articles: '*[_type == "article"] | order(date desc){"slug": slug.current, name, tags, date, "image": image.asset->url, content, author}',
    post: '*[_type == "article" && slug.current == $slug][0]{name, "slug": slug.current, "image": image.asset->url, date, tags, author, content}',
    projects: '*[_type == "projects"] | order(_createdAt desc){"slug": slug.current, "image": background_image.url, name, description}',
    project: '*[_type == "projects" && slug.current == $slug][0]{name, "slug": slug.current, date, client, budget, industry, description, "image": background_image.url, "thumbnails": project_images}',
    services: '*[_type == "services"] | order(_createdAt desc){"slug": slug.current, title, description, image}',
    service: '*[_type == "services" && slug.current == $slug][0]{title, "slug": slug.current, description, image, features, sub_services}',
    products: '*[_type == "products"] | order(_createdAt desc){"slug": slug.current, title, description, image}',
    product: '*[_type == "products" && slug.current == $slug][0]{title, "slug": slug.current, description, image, feature_title, features, sub_products}',
    terms: '*[_type == "terms"]{ title, content, _createdAt } | order(_createdAt asc)',
    policy: '*[_type == "policy"]{ title, content, _createdAt } | order(_createdAt asc)',
    faqs: '*[_type == "faqs"]{ question, answer }'
  };

  /* ---------- Portable Text -> HTML ---------- */
  function spans(block) {
    var defs = {};
    (block.markDefs || []).forEach(function (d) { defs[d._key] = d; });
    return (block.children || []).map(function (c) {
      var t = esc(c.text).replace(/\n/g, "<br>");
      (c.marks || []).forEach(function (m) {
        if (m === "strong") t = "<strong>" + t + "</strong>";
        else if (m === "em") t = "<em>" + t + "</em>";
        else if (m === "underline") t = "<u>" + t + "</u>";
        else if (m === "code") t = "<code>" + t + "</code>";
        else if (m === "strike-through") t = "<s>" + t + "</s>";
        else if (defs[m] && defs[m]._type === "link") t = '<a href="' + esc(safeUrl(defs[m].href)) + '" target="_blank" rel="noopener">' + t + "</a>";
      });
      return t;
    }).join("");
  }
  function plain(blocks) {
    return (blocks || []).map(function (b) { return (b.children || []).map(function (c) { return c.text; }).join(""); }).join(" ").replace(/\s+/g, " ").trim();
  }
  function refUrl(ref) {
    var m = /^image-(.+)-(\d+x\d+)-(\w+)$/.exec(ref || "");
    return m ? "https://cdn.sanity.io/images/" + S.projectId + "/" + S.dataset + "/" + m[1] + "-" + m[2] + "." + m[3] : "";
  }
  function portable(blocks) {
    if (typeof blocks === "string") return "<p>" + esc(blocks) + "</p>";
    var out = "", open = null;
    function close() { if (open) { out += "</" + open + ">"; open = null; } }
    (blocks || []).forEach(function (b) {
      if (b._type === "image") { close(); var u = refUrl(b.asset && b.asset._ref); if (u) out += '<img class="img-fluid rounded my-3" loading="lazy" src="' + esc(u) + '?w=1000&auto=format" alt="' + esc(b.alt || "") + '">'; return; }
      if (b._type !== "block") return;
      if (b.listItem) {
        var tag = b.listItem === "number" ? "ol" : "ul";
        if (open !== tag) { close(); out += "<" + tag + ' class="' + (tag === "ul" ? "check-list" : "") + ' mb-3">'; open = tag; }
        out += "<li>" + spans(b) + "</li>";
        return;
      }
      close();
      var s = b.style || "normal", h = spans(b);
      if (!h.replace(/<br>/g, "").trim()) return;
      if (/^h[1-6]$/.test(s)) out += "<" + s + ' class="fw-bold mt-4">' + h + "</" + s + ">";
      else if (s === "blockquote") out += '<blockquote class="blockquote border-start border-4 ps-3 my-3">' + h + "</blockquote>";
      else out += "<p>" + h + "</p>";
    });
    close();
    return out;
  }
  window.LPVT_SANITY = { query: fetchQuery, queries: Q, portable: portable };

  /* ---------- shared bits ---------- */
  function accordion(id, items, openCount) {
    openCount = openCount || 1;
    return '<div class="accordion" id="' + id + '">' + items.map(function (it, i) {
      var expanded = i < openCount;
      return '<div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button' + (expanded ? "" : " collapsed") + '" type="button" data-bs-toggle="collapse" data-bs-target="#' + id + "-" + i + '" aria-expanded="' + expanded + '">' + esc(it.title) + '</button></h3>' +
        '<div id="' + id + "-" + i + '" class="accordion-collapse collapse' + (expanded ? " show" : "") + '"' + (openCount === 1 ? ' data-bs-parent="#' + id + '"' : "") + '><div class="accordion-body">' + it.html + "</div></div></div>";
    }).join("") + "</div>";
  }
  function notFound(box, what) {
    box.innerHTML = '<div class="text-center py-5"><h2 class="h4">' + what + ' not found</h2><p class="lead-text">It may have been moved or removed.</p><a class="btn btn-green" href="/">Back to home</a></div>';
  }
  function failed(box) {
    if (box.hasAttribute("data-slug") || box.getAttribute("data-sanity") === "faq-cards") return; // static fallback stays, no message
    box.insertAdjacentHTML("beforeend", '<p class="text-center text-muted small mt-3">Live content is temporarily unavailable. Please refresh in a moment.</p>');
  }
  function setMeta(title, desc, image) {
    if (title) { document.title = title + " | LPV Technologies"; }
    function m(sel, v) { var e = document.querySelector(sel); if (e && v) e.setAttribute("content", v); }
    m('meta[name="description"]', desc); m('meta[property="og:title"]', title); m('meta[property="og:description"]', desc);
    if (image) m('meta[property="og:image"]', image);
  }
  function tagPill(t) { return '<a class="tag-pill" href="' + esc(blogUrl("", { tag: t })) + '">' + esc(t) + "</a>"; }
  function card(href, image, title, text, foot) {
    return '<div class="col-md-6 col-xl-4"><article class="blog-card bg-white"><a href="' + href + '" class="blog-thumb text-decoration-none" style="background-image:url(\'' + esc(img(image, 700) || assetUrl("images/logo.png")) + '\')" aria-label="' + esc(title) + '"></a>' +
      '<div class="p-4 d-flex flex-column flex-grow-1"><h2 class="h5 fw-bold"><a class="text-decoration-none" style="color:var(--dark-blue)" href="' + href + '">' + esc(title) + "</a></h2>" +
      '<p class="lead-text">' + esc(text) + '</p><div class="mt-auto small">' + (foot || "") + "</div></div></article></div>";
  }
  function excerpt(blocks, n) { var t = typeof blocks === "string" ? blocks : plain(blocks); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t; }
  function pager(box, page, pages, tag) {
    if (pages < 2) { box.innerHTML = ""; return; }
    function l(p, label, dis, act) { var q = new URLSearchParams(); if (tag) q.set("tag", tag); q.set("page", p); return '<li class="page-item' + (dis ? " disabled" : "") + (act ? " active" : "") + '"><a class="page-link" href="?' + q + '">' + label + "</a></li>"; }
    var h = l(page - 1, "Previous", page === 1); for (var i = 1; i <= pages; i++) h += l(i, i, false, i === page); h += l(page + 1, "Next", page === pages);
    box.innerHTML = '<ul class="pagination justify-content-center">' + h + "</ul>";
  }

  /* ---------- page renderers (chosen by data-sanity attribute) ---------- */
  var R = {};

  R.faq = function (box) {
    return fetchQuery(Q.faqs).then(function (rows) {
      rows = (rows || []).filter(function (r) { return r.question; });
      if (!rows.length) return;
      var limit = parseInt(box.getAttribute("data-limit"), 10) || 999;
      box.innerHTML = accordion("faqS", rows.slice(0, limit).map(function (r) { return { title: r.question, html: portable(r.answer) }; }));
    });
  };

  function legal(type) {
    return function (box) {
      return fetchQuery(Q[type]).then(function (rows) {
        if (!rows || !rows.length) return;
        box.innerHTML = accordion(type + "S", rows.map(function (r) { return { title: r.title, html: portable(r.content) }; }), 2);
      });
    };
  }
  R.terms = legal("terms");
  R.policy = legal("policy");

  R["blog-list"] = function (box) {
    var grid = document.getElementById("blogGrid");
    return fetchQuery(Q.articles).then(function (rows) {
      if (!rows || !rows.length) return;
      var tag = qs("tag"), author = qs("author"), per = 6, page = Math.max(1, parseInt(qs("page"), 10) || 1);
      var list = rows.filter(function (a) { return (!author || a.author === author) && (!tag || (a.tags || []).some(function (t) { return t.toLowerCase() === tag.toLowerCase(); })); });
      var pages = Math.max(1, Math.ceil(list.length / per)); page = Math.min(page, pages);
      grid.innerHTML = list.slice((page - 1) * per, page * per).map(function (a) {
        var href = blogUrl("post/", { slug: a.slug });
        var image = img(a.image || assetUrl("images/blog/" + a.slug + ".jpg"), 800) || assetUrl("images/logo.png");
        return '<article class="bc" data-article>' +
          '<a class="bc-img" href="' + href + '" style="background-image:url(\'' + esc(image) + '\')" aria-label="' + esc(a.name) + '"></a>' +
          '<div class="bc-body"><h2 class="bc-title"><a href="' + href + '">' + esc(a.name) + "</a></h2>" +
          '<div class="bc-tags">' + (a.tags || []).map(function (t) { return '<a class="bc-tag" href="' + esc(blogUrl("", { tag: t })) + '">' + esc(t) + "</a>"; }).join("") + "</div>" +
          '<p class="bc-text">' + esc(excerpt(a.content, 200)) + '</p><a class="bc-btn" href="' + href + '">Read more</a></div>' +
          '<div class="bc-foot">' + fmtDate(a.date) + (a.author ? " &bull; " + esc(a.author) : "") + "</div></article>";
      }).join("") || '<p class="text-center">No articles found.</p>';
      var info = document.getElementById("blogFilterInfo");
      if (info) info.innerHTML = tag ? 'Showing articles tagged <strong>' + esc(tag) + '</strong> &middot; <a href="' + esc(blogUrl()) + '">Clear filter</a>' : "";
      var p = document.getElementById("blogPager"); if (p) pager(p, page, pages, tag);
    });
  };

  /* Blog article: full-width hero (tags, title, date/author) + article body + "Latest Post" sidebar */
  function postImage(a, w) {
    return img(a.image || assetUrl("images/blog/" + a.slug + ".jpg"), w) || assetUrl("images/blog_bg.jpg");
  }
  function latestPosts(rows, currentSlug) {
    var list = (rows || []).filter(function (r) { return r.slug !== currentSlug; }).slice(0, 9);
    if (!list.length) return "";
    return '<aside class="post-side"><div class="post-latest"><h2>Latest Post</h2>' + list.map(function (r) {
      var href = blogUrl("post/", { slug: r.slug });
      return '<a class="post-latest-item" href="' + href + '">' +
        '<span class="post-latest-img" style="background-image:url(\'' + esc(postImage(r, 200)) + '\')"></span>' +
        '<span class="post-latest-text"><span class="post-latest-title">' + esc(r.name) + '</span><span class="post-latest-date">' + fmtDate(r.date) + "</span></span></a>";
    }).join("") + "</div></aside>";
  }
  R.post = function (box) {
    var slug = qs("slug"); if (!slug) return notFound(box, "Article");
    return Promise.all([fetchQuery(Q.post, { slug: slug }), fetchQuery(Q.articles).catch(function () { return []; })]).then(function (res) {
      var a = res[0]; if (!a) return notFound(box, "Article");
      setMeta(a.name, excerpt(a.content, 155), a.image);
      var tags = (a.tags || []).map(function (t) { return '<a class="post-tag" href="' + esc(blogUrl("", { tag: t })) + '">' + esc(t) + "</a>"; }).join("");
      a.slug = a.slug || slug;
      box.style.paddingTop = "0"; box.style.minHeight = "0";
      box.innerHTML =
        '<header class="post-hero" style="background-image:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.62)),url(\'' + esc(postImage(a, 1800)) + '\')">' +
          '<div class="post-hero-inner">' +
            (tags ? '<div class="post-tags">' + tags + "</div>" : "") +
            "<h1>" + esc(a.name) + "</h1>" +
            '<div class="post-meta"><span><i class="bi bi-calendar3"></i>' + fmtDate(a.date) + "</span>" +
            (a.author ? '<a href="' + esc(blogUrl("", { author: a.author })) + '"><i class="bi bi-person"></i>' + esc(a.author) + "</a>" : "") + "</div>" +
          "</div></header>" +
        '<section class="post-wrap"><div class="post-grid">' +
          '<article class="post-main"><div class="post-body">' + portable(a.content) + '</div>' +
          '<hr class="my-5"><a class="btn btn-green" href="' + esc(blogUrl()) + '">&larr; All articles</a></article>' +
          latestPosts(res[1], a.slug) +
        "</div></section>";
    });
  };

  R["card-list"] = function (box) {
    var type = box.getAttribute("data-type"), base = box.getAttribute("data-base");
    return fetchQuery(Q[type]).then(function (rows) {
      if (!rows || !rows.length) { if (box.hasAttribute("data-hide-empty")) box.closest("section").style.display = "none"; return; }
      box.innerHTML = rows.map(function (r) {
        var title = r.title || r.name, imgUrl = r.image && (r.image.url || r.image);
        var href = box.getAttribute("data-mode") === "path" ? base + encodeURIComponent(r.slug) + "/" : base + "?slug=" + encodeURIComponent(r.slug);
        return card(href, typeof imgUrl === "string" ? imgUrl : "", title, excerpt(r.description, 150), '<a href="' + href + '">Learn more &rarr;</a>');
      }).join("");
      var s = box.closest("section"); if (s) s.style.display = "";
    });
  };

  function titled(blocks, title) { return '<div class="mb-4"><h2 class="h4 fw-bold">' + esc(title) + "</h2>" + portable(blocks) + "</div>"; }

  function detail(type, what, build) {
    return function (box) {
      var fixed = box.getAttribute("data-slug"), slug = fixed || qs("slug"); if (!slug) return notFound(box, what);
      return fetchQuery(Q[type], { slug: slug }).then(function (d) {
        if (!d) { return fixed ? null : notFound(box, what); }
        setMeta(d.title || d.name, excerpt(d.description, 155), d.image && (d.image.url || d.image));
        var hero = document.getElementById("detailHero");
        var im = d.image && (d.image.url || d.image);
        if (hero && typeof im === "string") hero.style.backgroundImage = "url('" + img(im, 1800) + "')";
        var h1 = document.getElementById("detailTitle"); if (h1) h1.textContent = d.title || d.name;
        box.innerHTML = build(d);
        var live = box.closest("[data-live]");
        if (live) { live.hidden = false; var st = document.querySelector("[data-static]"); if (st) st.hidden = true; }
      });
    };
  }
  function features(list, title) {
    return (list && list.length) ? '<h2 class="h4 fw-bold mt-4">' + esc(title || "Key Features") + '</h2><ul class="check-list mt-3">' + list.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "";
  }
  function subs(list) {
    return (list && list.length) ? '<div class="row g-4 mt-2">' + list.map(function (s) { return '<div class="col-md-6"><div class="card-soft p-4 h-100"><h3 class="h5 fw-bold">' + esc(s.title) + "</h3>" + portable(s.description) + "</div></div>"; }).join("") + "</div>" : "";
  }
  R.service = detail("service", "Service", function (d) { return portable(d.description) + features(d.features) + subs(d.sub_services) + '<a class="btn btn-green mt-4" href="/contact/">Talk to us</a>'; });
  R.product = detail("product", "Product", function (d) { return portable(d.description) + features(d.features, d.feature_title) + subs(d.sub_products) + '<a class="btn btn-green mt-4" href="/contact/">Request a quote</a>'; });
  R.project = detail("project", "Project", function (d) {
    var facts = [["Client", d.client], ["Industry", d.industry], ["Budget", d.budget], ["Date", d.date && fmtDate(d.date)]].filter(function (f) { return f[1]; });
    return (facts.length ? '<div class="row g-3 mb-4">' + facts.map(function (f) { return '<div class="col-6 col-md-3"><div class="card-soft p-3 h-100"><div class="small text-muted">' + f[0] + '</div><div class="fw-bold">' + esc(f[1]) + "</div></div></div>"; }).join("") + "</div>" : "") +
      portable(d.description) +
      ((d.thumbnails && d.thumbnails.length) ? '<div class="row g-3 mt-3">' + d.thumbnails.map(function (t) { return '<div class="col-md-4"><img class="img-fluid rounded w-100" loading="lazy" src="' + esc(img(t.url, 700)) + '" alt="' + esc(t.alt || t.caption || "") + '"></div>'; }).join("") + "</div>" : "");
  });


  /* ---------- Product page (hero, datasheet, sub-products, description, features) ---------- */
  var DATASHEET = "https://drive.google.com/file/d/1pHjF3pxfr-FQ8QPHPbX-n1LHjY2Ls0HO/view?usp=sharing";
  var GEAR_SVG = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" color="#fff" style="color:#fff" height="35px" width="35px" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke-width="2" d="M6,9 C7.65685425,9 9,7.65685425 9,6 C9,4.34314575 7.65685425,3 6,3 C4.34314575,3 3,4.34314575 3,6 C3,7.65685425 4.34314575,9 6,9 Z M6,3 L6,0 M6,12 L6,9 M0,6 L3,6 M9,6 L12,6 M2,2 L4,4 M8,8 L10,10 M10,2 L8,4 M4,8 L2,10 M18,12 C19.6568542,12 21,10.6568542 21,9 C21,7.34314575 19.6568542,6 18,6 C16.3431458,6 15,7.34314575 15,9 C15,10.6568542 16.3431458,12 18,12 Z M18,6 L18,3 M18,15 L18,12 M12,9 L15,9 M21,9 L24,9 M14,5 L16,7 M20,11 L22,13 M22,5 L20,7 M16,11 L14,13 M9,21 C10.6568542,21 12,19.6568542 12,18 C12,16.3431458 10.6568542,15 9,15 C7.34314575,15 6,16.3431458 6,18 C6,19.6568542 7.34314575,21 9,21 Z M9,15 L9,12 M9,24 L9,21 M3,18 L6,18 M12,18 L15,18 M5,14 L7,16 M11,20 L13,22 M13,14 L11,16 M7,20 L5,22"></path></svg>';
  function ppHtml(d) {
    var im = d.image && (d.image.url || d.image); im = typeof im === "string" ? im : "";
    var hero = im ? img(im, 1920) : assetUrl("images/Product-Page-Cover.jpg");
    var cards = (d.sub_products || []).map(function (c) {
      return '<div class="pp-card"><span class="pp-card-icon">' + GEAR_SVG + '</span><h6>' + esc(c.title) + "</h6><article>" + portable(c.description) + "</article></div>";
    }).join("");
    var feats = (d.features || []).map(function (f) { return '<div class="pp-feat"><i class="bi bi-check-circle-fill"></i><span>' + esc(f) + "</span></div>"; }).join("");
    return '<section class="pp-hero" style="background-image:linear-gradient(rgba(0,23,23,.6),rgba(0,23,23,.6)),url(\'' + esc(hero) + '\')"><div class="pp-hero-inner"><span class="pp-hero-icon">' + GEAR_SVG + '</span><h1>' + esc(d.title) + "</h1></div></section>" +
      '<div class="pp-ds"><a class="pp-btn" href="' + DATASHEET + '" target="_blank" rel="noopener">Datasheet</a></div>' +
      (cards ? '<section class="pp-list"><div class="pp-container"><div class="pp-cards">' + cards + "</div></div></section>" : "") +
      '<section class="pp-desc"><div class="pp-container"><div class="pp-desc-row">' +
      (im ? '<div class="pp-desc-img"><img src="' + esc(img(im, 1000)) + '" alt="' + esc(d.title) + '"></div>' : "") +
      '<div class="pp-desc-text">' + (d.feature_title ? '<h3 class="pp-feat-title">' + esc(d.feature_title) + "</h3>" : "") + "<article>" + portable(d.description) + "</article>" +
      (feats ? '<div class="pp-keys"><h3>Keys of Features</h3><div class="pp-keys-grid">' + feats + "</div></div>" : "") + "</div></div></div></section>";
  }
  R["product-page"] = function (box) {
    var fixed = box.getAttribute("data-slug"), slug = fixed || qs("slug"); if (!slug) return notFound(box, "Product");
    return fetchQuery(Q.product, { slug: slug }).then(function (d) {
      if (!d) { return fixed ? null : notFound(box, "Product"); }
      setMeta(d.title, excerpt(d.description, 155), d.image && (d.image.url || d.image));
      box.innerHTML = ppHtml(d);
    });
  };

  /* ---------- FAQ cards (2 columns, first two open, Previous / Next) ---------- */
  function faqCards(box, items) {
    function answered(list) {
      return (list || []).filter(function (it) { return it && it.q && it.q.trim() && it.html && it.html.trim(); });
    }
    items = answered(items);
    var per = 10, pages = Math.max(1, Math.ceil(items.length / per)), page = 1;
    function draw() {
      var start = (page - 1) * per, list = items.slice(start, start + per);
      var h = '<div class="faqc-grid">' + list.map(function (it, i) {
        return '<details class="faqc"' + (i < 2 ? " open" : "") + '><summary class="faqc-head"><span>' + esc(it.q) + '</span><i class="bi bi-chevron-down"></i></summary>' +
          '<div class="faqc-body">' + it.html + "</div></details>";
      }).join("") + "</div>";
      h += '<div class="faqc-pager"><button type="button" class="faqc-nav" data-go="-1"' + (page === 1 ? " disabled" : "") + '>Previous</button><button type="button" class="faqc-nav" data-go="1"' + (page === pages ? " disabled" : "") + ">Next</button></div>";
      box.innerHTML = h;
      box.querySelectorAll(".faqc").forEach(function (card, index) {
        card.classList.add("faq-card-in");
        card.style.setProperty("--faq-card-delay", Math.min(index, 9) * 60 + "ms");
      });
      box.querySelectorAll(".faqc-nav").forEach(function (button) {
        button.addEventListener("click", function () {
          page = Math.min(pages, Math.max(1, page + parseInt(button.getAttribute("data-go"), 10)));
          draw();
        });
      });
    }
    draw();
    return function (nextItems) {
      items = answered(nextItems);
      pages = Math.max(1, Math.ceil(items.length / per));
      page = Math.min(page, pages);
      draw();
    };
  }
  R["faq-cards"] = function (box) {
    var local = (window.LPVT_FAQS || []).map(function (f) { return { q: f.q, html: f.a ? "<p>" + esc(f.a) + "</p>" : "" }; });
    var updateFaqCards = faqCards(box, local);
    return fetchQuery(Q.faqs).then(function (rows) {
      rows = (rows || []).filter(function (r) { return r.question; });
      if (rows.length) updateFaqCards(rows.map(function (r) { return { q: r.question, html: portable(r.answer) }; }));
    });
  };

  /* ---------- nav: Products dropdown from Sanity ---------- */
  function navProducts() {
    var toggles = document.querySelectorAll(".lp-nav .dropdown-toggle");
    var menu = null;
    toggles.forEach(function (t) { if (/^\s*Products\s*$/.test(t.textContent)) menu = t.parentNode.querySelector(".dropdown-menu"); });
    if (!menu) return;
    var siteRoot = window.LPVT_SITE_ROOT || new URL("./", window.location.href);
    var staticPages = {
      "green-impact": true,
      "panel-specification": true,
      "warranty": true,
      "solar-panels": true
    };
    fetchQuery('*[_type == "products"] | order(_createdAt desc){title, "slug": slug.current}').then(function (rows) {
      if (!rows || !rows.length) return;
      menu.innerHTML = '<li class="all-link"><a class="dropdown-item" href="' + esc(new URL("products/", siteRoot).href) + '">All Products</a></li>' + rows.filter(function (r) { return r && r.slug && r.title; }).map(function (r) {
        var productUrl;
        if (Object.prototype.hasOwnProperty.call(staticPages, r.slug)) {
          productUrl = new URL("products/" + encodeURIComponent(r.slug) + ".html", siteRoot);
        } else {
          productUrl = new URL("products/detail.html", siteRoot);
          productUrl.searchParams.set("slug", r.slug);
        }
        return '<li><a class="dropdown-item" href="' + esc(productUrl.href) + '">' + esc(r.title) + "</a></li>";
      }).join("");
    }).catch(function (error) {
      console.error("Unable to load products for navigation.", error);
    });
  }

  /* ---------- boot ---------- */
  if (!S.projectId) return;
  if (window.LPVT_COMPONENTS_READY) {
    window.LPVT_COMPONENTS_READY.then(navProducts);
  } else if (document.querySelector(".lp-nav")) {
    navProducts();
  } else {
    window.addEventListener("lpvt:components-ready", navProducts, { once: true });
  }
  document.querySelectorAll("[data-sanity]").forEach(function (box) {
    var fn = R[box.getAttribute("data-sanity")];
    if (fn) {
      Promise.resolve().then(function () { return fn(box); }).catch(function () { failed(box); }).then(function () {
        if (box.getAttribute("data-sanity") === "product-page") window.dispatchEvent(new CustomEvent("lpvt:product-rendered", { detail: { box: box } }));
      });
    }
  });
})();