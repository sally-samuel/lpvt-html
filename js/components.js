(function () {
  "use strict";
  var assetUrl = window.LPVT_ASSET_URL || function (path) { return path; };

  function load(selector, path) {
    var placeholder = document.querySelector(selector);
    if (!placeholder) return Promise.resolve();

    return fetch(assetUrl(path))
      .then(function (response) {
        if (!response.ok) throw new Error("Unable to load " + path);
        return response.text();
      })
      .then(function (html) {
        var template = document.createElement("template");
        template.innerHTML = html;
        template.content.querySelectorAll('img[src^="/images/"]').forEach(function (image) {
          image.src = assetUrl(image.getAttribute("src"));
        });
        placeholder.replaceWith(template.content);
      })
      .catch(function (error) {
        console.error(error);
      });
  }

  function setActiveNavigation() {
    setupProductNavigation();
    var path = window.location.pathname.replace(/index\.html$/, "");
    var links = document.querySelectorAll(".lp-nav a[href]");
    links.forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href || href.charAt(0) !== "/") return;
      if (path === href || (href !== "/" && path.indexOf(href) === 0)) {
        link.classList.add("active");
        var dropdown = link.closest(".dropdown");
        var toggle = dropdown && dropdown.querySelector(".dropdown-toggle");
        if (toggle) toggle.classList.add("active");
      }
    });
  }

  function setupProductNavigation() {
    document.querySelectorAll(".lp-nav .dropdown").forEach(function (dropdown) {
      var link = dropdown.querySelector(".product-link, .dropdown-toggle");
      if (!link || link.textContent.trim() !== "Products") return;

      link.href = "/products/";
      link.classList.remove("dropdown-toggle");
      link.classList.add("product-link");
      link.removeAttribute("data-bs-toggle");
      link.removeAttribute("aria-expanded");
      link.removeAttribute("role");
      dropdown.classList.add("product-dropdown-item");

      dropdown.querySelectorAll(".dropdown-menu .dropdown-item").forEach(function (item) {
        var slug = item.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (slug) item.href = "/products/" + slug + "/";
      });

      if (!dropdown.querySelector(".product-menu-toggle")) {
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "nav-link dropdown-toggle product-menu-toggle d-lg-none";
        toggle.setAttribute("data-bs-toggle", "dropdown");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Toggle products menu");
        toggle.innerHTML = '<span class="visually-hidden">Toggle products menu</span>';
        link.insertAdjacentElement("afterend", toggle);
      }
    });
  }

  window.LPVT_COMPONENTS_READY = Promise.all([
    load('[data-site-component="header"]', "./components/header.html"),
    load('[data-site-component="footer"]', "./components/footer.html")
  ]).then(setActiveNavigation);
})();