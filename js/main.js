/* LPV Technologies - site scripts (vanilla JS + Bootstrap) */
(function () {
  "use strict";
  var cfg = window.LPVT_CONFIG || {};

  /* ---- 1. Lazy-load section backgrounds (saves bandwidth) ---- */
  function loadBg(el) {
    var src = el.getAttribute("data-bg");
    if (!src) return;
    el.style.backgroundImage = "url('" + src + "')";
    el.removeAttribute("data-bg");
  }
  var bgEls = document.querySelectorAll("[data-bg]:not(.carousel-item)");
  if ("IntersectionObserver" in window) {
    var bgObs = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { loadBg(e.target); obs.unobserve(e.target); }
      });
    }, { rootMargin: "400px 0px" });
    bgEls.forEach(function (el) { bgObs.observe(el); });
  } else {
    bgEls.forEach(loadBg);
  }

  /* ---- 2. Home hero carousel: load images only when needed ---- */
  var hero = document.getElementById("heroCarousel");
  if (hero) {
    var items = hero.querySelectorAll(".carousel-item");
    setTimeout(function () { if (items[1]) loadBg(items[1]); }, 1000);
    hero.addEventListener("slide.bs.carousel", function (e) {
      loadBg(e.relatedTarget);
      var next = e.relatedTarget.nextElementSibling;
      if (next) loadBg(next);
    });
  }

  /* ---- 3. Animated counters ---- */
  var counters = document.querySelectorAll(".counter");
  var c = cfg.counters || {};
  var map = { mw: c.capacityMW, wp: c.powerWp, k: c.modulesK, m: c.co2M };
  counters.forEach(function (el) {
    var key = el.getAttribute("data-key");
    var target = key ? map[key] : parseFloat(el.getAttribute("data-target"));
    if (target === null || target === undefined || isNaN(target)) {
      var box = el.closest(".counter-col");
      if (box) box.style.display = "none";
      return;
    }
    el.setAttribute("data-target", target);
  });
  function animate(el) {
    var target = parseFloat(el.getAttribute("data-target"));
    if (isNaN(target)) return;
    var dur = 1500, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var cObs = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animate(e.target); obs.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cObs.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.getAttribute("data-target"); });
  }

  /* ---- 4. FAQ accordion rendered from js/data.js ---- */
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  document.querySelectorAll("[data-faq]").forEach(function (box, bi) {
    var limit = parseInt(box.getAttribute("data-limit"), 10) || 999;
    var list = (window.LPVT_FAQS || []).filter(function (f) { return f.a && f.a.trim(); }).slice(0, limit);
    var id = "faq" + bi;
    box.innerHTML = '<div class="accordion" id="' + id + '">' + list.map(function (f, i) {
      return '<div class="accordion-item"><h3 class="accordion-header">' +
        '<button class="accordion-button' + (i ? " collapsed" : "") + '" type="button" data-bs-toggle="collapse" data-bs-target="#' + id + "-" + i + '">' + esc(f.q) + '</button></h3>' +
        '<div id="' + id + "-" + i + '" class="accordion-collapse collapse' + (i ? "" : " show") + '" data-bs-parent="#' + id + '">' +
        '<div class="accordion-body">' + esc(f.a) + '</div></div></div>';
    }).join("") + "</div>";
  });

  /* ---- 5. Blog: tag filter + pagination (?tag=Solar&page=2) ---- */
  var grid = document.getElementById("blogGrid");
  if (grid) {
    var PER_PAGE = 6;
    var params = new URLSearchParams(location.search);
    var tag = params.get("tag");
    var page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    var cards = Array.prototype.slice.call(grid.querySelectorAll("[data-article]"));
    var shown = cards.filter(function (card) {
      if (!tag) return true;
      return (card.getAttribute("data-tags") || "").split("|").map(function (t) { return t.toLowerCase(); }).indexOf(tag.toLowerCase()) > -1;
    });
    var pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    page = Math.min(page, pages);
    cards.forEach(function (card) { card.style.display = "none"; });
    shown.slice((page - 1) * PER_PAGE, page * PER_PAGE).forEach(function (card) { card.style.display = ""; });
    var info = document.getElementById("blogFilterInfo");
    if (info && tag) info.innerHTML = 'Showing articles tagged <strong>' + esc(tag) + '</strong> &middot; <a href="/blog/">Clear filter</a>';
    var pager = document.getElementById("blogPager");
    if (pager && pages > 1) {
      function link(p, label, disabled, active) {
        var q = new URLSearchParams(); if (tag) q.set("tag", tag); q.set("page", p);
        return '<li class="page-item' + (disabled ? " disabled" : "") + (active ? " active" : "") + '"><a class="page-link" href="?' + q.toString() + '">' + label + "</a></li>";
      }
      var h = link(page - 1, "Previous", page === 1);
      for (var i = 1; i <= pages; i++) h += link(i, i, false, i === page);
      h += link(page + 1, "Next", page === pages);
      pager.innerHTML = '<ul class="pagination justify-content-center">' + h + "</ul>";
    }
  }

  /* ---- 6. Forms (EmailJS) ---- */
  function showMsg(form, ok, text) {
    var box = form.querySelector(".form-msg");
    if (!box) return;
    box.className = "form-msg alert alert-" + (ok ? "success" : "danger") + " mt-3";
    box.textContent = text;
  }
  document.querySelectorAll("form[data-emailjs]").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!form.checkValidity()) { form.classList.add("was-validated"); return; }
      if (!window.emailjs) { showMsg(form, false, "Email service failed to load. Please email hello@lpvtechnologies.com instead."); return; }
      var btn = form.querySelector("button[type=submit]");
      var old = btn.textContent; btn.disabled = true; btn.textContent = "Sending...";
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      var first = data.first_name || "", last = data.last_name || "";
      var fullName = data.name || (first + " " + last).trim();
      var lines = Object.keys(data).map(function (k) { return k.replace(/_/g, " ") + ": " + data[k]; });
      var params = {
        name: fullName, from_name: fullName, user_name: fullName, fullName: fullName,
        email: data.email || "", from_email: data.email || "", user_email: data.email || "", reply_to: data.email || "",
        phone: data.phone || "", whatsapp: data.whatsapp || "",
        subject: data.subject || (form.getAttribute("data-subject") || "Website enquiry"),
        message: data.message ? data.message : lines.join("\n"),
        details: lines.join("\n"),
        company: data.company || "", job_role: data.job_role || ""
      };
      for (var k in data) { if (!(k in params)) params[k] = data[k]; }
      var e = cfg.emailjs || {};
      window.emailjs.send(e.serviceId, e.templateId, params, { publicKey: e.publicKey })
        .then(function () {
          showMsg(form, true, "Thank you! Your message has been sent. We will get back to you shortly.");
          form.reset(); form.classList.remove("was-validated");
        })
        .catch(function () { showMsg(form, false, "Sorry, something went wrong. Please try again or email hello@lpvtechnologies.com."); })
        .finally(function () { btn.disabled = false; btn.textContent = old; });
    });
  });


  /* ---- 8. Nav: "Products" link goes to /products/ on desktop (submenu opens on hover) ---- */
  var wide = window.matchMedia("(min-width: 992px)");
  var navLinks = Array.prototype.filter.call(document.querySelectorAll(".lp-nav .dropdown-toggle"), function (t) {
    var h = t.getAttribute("href"); return h && h !== "#";
  });
  function navMode() {
    navLinks.forEach(function (t) {
      if (wide.matches) t.removeAttribute("data-bs-toggle");      // desktop: plain link, CSS hover opens the menu
      else t.setAttribute("data-bs-toggle", "dropdown");          // mobile: tap opens the menu
    });
  }
  navMode();
  if (wide.addEventListener) wide.addEventListener("change", navMode);

  /* ---- 7. Footer year ---- */
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();