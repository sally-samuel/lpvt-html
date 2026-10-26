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
    var path = window.location.pathname.replace(/index\.html$/, "");
    var links = document.querySelectorAll(".lp-nav a[href]");
    links.forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href || href.charAt(0) !== "/") return;
      if (path === href || (href !== "/" && path.indexOf(href) === 0)) {
        link.classList.add("active");
        var dropdown = link.closest(".dropdown");
        if (dropdown) dropdown.querySelector(".dropdown-toggle").classList.add("active");
      }
    });
  }

  window.LPVT_COMPONENTS_READY = Promise.all([
    load('[data-site-component="header"]', "./components/header.html"),
    load('[data-site-component="footer"]', "/components/footer.html")
  ]).then(setActiveNavigation);
})();