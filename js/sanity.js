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
  function accordion(id, items) {
    return '<div class="accordion" id="' + id + '">' + items.map(function (it, i) {
      return '<div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button' + (i ? " collapsed" : "") + '" type="button" data-bs-toggle="collapse" data-bs-target="#' + id + "-" + i + '">' + esc(it.title) + '</button></h3>' +
        '<div id="' + id + "-" + i + '" class="accordion-collapse collapse' + (i ? "" : " show") + '" data-bs-parent="#' + id + '"><div class="accordion-body">' + it.html + "</div></div></div>";
    }).join("") + "</div>";
  }
  function faqAnswer(answer) {
    var html = portable(answer);
    var text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim();
    if (text || /<img\b/i.test(html)) return html;
    return "";
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
  function tagPill(t) { return '<a class="tag-pill" href="/blog/?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>"; }
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
      rows = (rows || []).map(function (r) { return { question: r.question, answer: faqAnswer(r.answer) }; })
        .filter(function (r) { return r.question && r.answer; });
      if (!rows.length) return;
      var limit = parseInt(box.getAttribute("data-limit"), 10) || 999;
      box.innerHTML = accordion("faqS", rows.slice(0, limit).map(function (r) { return { title: r.question, html: r.answer }; }));
    });
  };

  function legal(type) {
    return function (box) {
      return fetchQuery(Q[type]).then(function (rows) {
        if (!rows || !rows.length) return;
        box.innerHTML = accordion(type + "S", rows.map(function (r) { return { title: r.title, html: portable(r.content) }; }));
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
        var href = "/blog/post/?slug=" + encodeURIComponent(a.slug);
        var image = img(a.image || assetUrl("images/blog/" + a.slug + ".jpg"), 800) || assetUrl("images/logo.png");
        return '<article class="bc" data-article>' +
          '<a class="bc-img" href="' + href + '" style="background-image:url(\'' + esc(image) + '\')" aria-label="' + esc(a.name) + '"></a>' +
          '<div class="bc-body"><h2 class="bc-title"><a href="' + href + '">' + esc(a.name) + "</a></h2>" +
          '<div class="bc-tags">' + (a.tags || []).map(function (t) { return '<a class="bc-tag" href="/blog/?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>"; }).join("") + "</div>" +
          '<p class="bc-text">' + esc(excerpt(a.content, 200)) + '</p><a class="bc-btn" href="' + href + '">Read more</a></div>' +
          '<div class="bc-foot">' + fmtDate(a.date) + (a.author ? " &bull; " + esc(a.author) : "") + "</div></article>";
      }).join("") || '<p class="text-center">No articles found.</p>';
      var info = document.getElementById("blogFilterInfo");
      if (info) info.innerHTML = tag ? 'Showing articles tagged <strong>' + esc(tag) + '</strong> &middot; <a href="/blog/">Clear filter</a>' : "";
      var p = document.getElementById("blogPager"); if (p) pager(p, page, pages, tag);
    });
  };

  R.post = function (box) {
    var slug = qs("slug"); if (!slug) return notFound(box, "Article");
    return fetchQuery(Q.post, { slug: slug }).then(function (a) {
      if (!a) return notFound(box, "Article");
      setMeta(a.name, excerpt(a.content, 155), a.image);
      box.innerHTML = '<article class="mx-auto" style="max-width:820px">' +
        '<div class="mb-3">' + (a.tags || []).map(tagPill).join("") + "</div>" +
        '<h1 class="fw-bold" style="color:var(--dark-blue)">' + esc(a.name) + "</h1>" +
        '<p class="text-muted">' + fmtDate(a.date) + (a.author ? ' &middot; <a href="/blog/?author=' + encodeURIComponent(a.author) + '">' + esc(a.author) + "</a>" : "") + "</p>" +
        (a.image ? '<img class="img-fluid rounded mb-4 w-100" src="' + esc(img(a.image, 1400)) + '" alt="' + esc(a.name) + '">' : "") +
        '<div class="post-body">' + portable(a.content) + '</div><hr class="my-5"><a class="btn btn-green" href="/blog/">&larr; All articles</a></article>';
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
  function ppHtml(d) {
    var im = d.image && (d.image.url || d.image); im = typeof im === "string" ? im : "";
    var hero = im ? img(im, 1920) : assetUrl("images/Product-Page-Cover.jpg");
    var cards = (d.sub_products || []).map(function (c) {
      return '<div class="pp-card"><span class="pp-card-icon"><i class="bi bi-gear-wide-connected"></i></span><h6>' + esc(c.title) + "</h6><article>" + portable(c.description) + "</article></div>";
    }).join("");
    var feats = (d.features || []).map(function (f) { return '<div class="pp-feat"><i class="bi bi-check-circle-fill"></i><span>' + esc(f) + "</span></div>"; }).join("");
    return '<section class="pp-hero" style="background-image:linear-gradient(rgba(0,23,23,.6),rgba(0,23,23,.6)),url(\'' + esc(hero) + '\')"><div class="pp-hero-inner"><span class="pp-hero-icon"><i class="bi bi-gear-wide-connected"></i></span><h1>' + esc(d.title) + "</h1></div></section>" +
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
    var per = 10, pages = Math.max(1, Math.ceil(items.length / per)), page = 1, open = {};
    function draw() {
      var start = (page - 1) * per, list = items.slice(start, start + per);
      var h = '<div class="faqc-grid">' + list.map(function (it, i) {
        var on = open[start + i] === undefined ? i < 2 : open[start + i];
        return '<div class="faqc"><button type="button" class="faqc-head' + (on ? " on" : "") + '" data-i="' + (start + i) + '"><span>' + esc(it.q) + '</span><i class="bi bi-chevron-' + (on ? "up" : "down") + '"></i></button>' +
          (on && it.html ? '<div class="faqc-body">' + it.html + "</div>" : "") + "</div>";
      }).join("") + "</div>";
      h += '<div class="faqc-pager"><button type="button" class="faqc-nav" data-go="-1"' + (page === 1 ? " disabled" : "") + '>Previous</button><button type="button" class="faqc-nav" data-go="1"' + (page === pages ? " disabled" : "") + ">Next</button></div>";
      box.innerHTML = h;
    }
    box.onclick = function (e) {
      var t = e.target.closest("[data-i],[data-go]"); if (!t || !box.contains(t)) return;
      if (t.hasAttribute("data-go")) { page = Math.min(pages, Math.max(1, page + parseInt(t.getAttribute("data-go"), 10))); open = {}; }
      else { var i = parseInt(t.getAttribute("data-i"), 10), start = (page - 1) * per, cur = open[i] === undefined ? (i - start) < 2 : open[i]; open[i] = !cur; }
      draw();
    };
    draw();
  }
  R["faq-cards"] = function (box) {
    var local = (window.LPVT_FAQS || []).filter(function (f) { return f.q && f.a && f.a.trim(); })
      .map(function (f) { return { q: f.q, html: "<p>" + esc(f.a) + "</p>" }; });
    if (local.length) faqCards(box, local);
    return fetchQuery(Q.faqs).then(function (rows) {
      rows = (rows || []).map(function (r) { return { q: r.question, html: faqAnswer(r.answer) }; })
        .filter(function (r) { return r.q && r.html; });
      if (rows.length) faqCards(box, rows);
    });
  };

  /* ---------- nav: Products dropdown from Sanity ---------- */
  function navProducts() {
    var toggles = document.querySelectorAll(".lp-nav .dropdown-toggle");
    var menu = null;
    toggles.forEach(function (t) { if (/^\s*Products\s*$/.test(t.textContent)) menu = t.parentNode.querySelector(".dropdown-menu"); });
    if (!menu) return;
    fetchQuery('*[_type == "products"] | order(_createdAt desc){title, "slug": slug.current}').then(function (rows) {
      if (!rows || !rows.length) return;
      menu.innerHTML = '<li class="all-link"><a class="dropdown-item" href="/products/">All Products</a></li>' + rows.map(function (r) { return '<li><a class="dropdown-item" href="/products/' + encodeURIComponent(r.slug) + '/">' + esc(r.title) + "</a></li>"; }).join("");
    }).catch(function () {});
  }

  /* ---------- boot ---------- */
  if (!S.projectId) return;
  navProducts();
  document.querySelectorAll("[data-sanity]").forEach(function (box) {
    var fn = R[box.getAttribute("data-sanity")];
    if (fn) { Promise.resolve().then(function () { return fn(box); }).catch(function () { failed(box); }); }
  });
})();