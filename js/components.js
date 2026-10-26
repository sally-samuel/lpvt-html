(function () {
  "use strict";

  function load(selector, path) {
    var placeholder = document.querySelector(selector);
    if (!placeholder) return Promise.resolve();

    return fetch(path)
      .then(function (response) {
        if (!response.ok) throw new Error("Unable to load " + path);
        return response.text();
      })
      .then(function (html) {
        placeholder.outerHTML = html;
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
    load('[data-site-component="header"]', "/components/header.html"),
    load('[data-site-component="footer"]', "/components/footer.html")
  ]).then(setActiveNavigation);
})();