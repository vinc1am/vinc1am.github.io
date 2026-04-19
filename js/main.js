(function () {
  "use strict";

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var navToggle = document.querySelector(".nav__toggle");
  var navMenu = document.getElementById("nav-menu");
  if (navToggle && navMenu) {
    navToggle.addEventListener("click", function () {
      var open = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navMenu.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var navBrand = document.querySelector(".nav__brand");
  if (navBrand) {
    navBrand.addEventListener("click", function (e) {
      e.preventDefault();
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      if (history.replaceState) {
        history.replaceState(null, "", "#top");
      } else {
        window.location.hash = "#top";
      }
      if (navMenu && navToggle) {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  var revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  var rotatingEl = document.getElementById("hero-rotating");
  if (rotatingEl) {
    var roles = [
      "Vincent Lam",
      "Data Scientist",
      "AI Engineer",
      "Solution Architect"
    ];
    var roleIndex = 0;
    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    function advanceRole() {
      roleIndex = (roleIndex + 1) % roles.length;
      rotatingEl.classList.add("is-animating");
      window.setTimeout(function () {
        rotatingEl.textContent = roles[roleIndex];
        rotatingEl.classList.remove("is-animating");
      }, 240);
    }
    if (!motionQuery.matches) {
      window.setInterval(advanceRole, 2800);
    }
  }

  var certRoot = document.querySelector("[data-cert-tabs]");
  if (certRoot) {
    var certTabs = certRoot.querySelectorAll(".cert-tab");
    var certPanels = certRoot.querySelectorAll(".cert-panel");
    certTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var panelId = tab.getAttribute("aria-controls");
        certTabs.forEach(function (t) {
          var sel = t === tab;
          t.classList.toggle("is-active", sel);
          t.setAttribute("aria-selected", sel ? "true" : "false");
          t.setAttribute("tabindex", sel ? "0" : "-1");
        });
        certPanels.forEach(function (panel) {
          var show = panel.id === panelId;
          panel.hidden = !show;
        });
      });
    });
  }

  var timelineRoot = document.querySelector("[data-timeline-interactive]");
  if (timelineRoot) {
    var stash = timelineRoot.querySelector(".timeline-stash");
    var detailCard = document.getElementById("timeline-detail-card");
    var detailPanel = document.getElementById("timeline-detail");
    var buttons = timelineRoot.querySelectorAll(".timeline-rail__btn");
    var selectedIndex = 0;
    var previewIndex = null;

    function stashCardAt(idx) {
      if (!stash) return null;
      return stash.querySelector(
        ':scope > .timeline-stash__card[data-timeline-index="' + idx + '"]'
      );
    }

    function railButtonAt(idx) {
      return timelineRoot.querySelector('.timeline-rail__btn[data-timeline-index="' + idx + '"]');
    }

    function indexFromBtn(btn) {
      var n = parseInt(btn.getAttribute("data-timeline-index"), 10);
      return isNaN(n) ? 0 : n;
    }

    function timelineMaxIndex() {
      return Math.max(0, buttons.length - 1);
    }

    function displayIndex() {
      return previewIndex !== null ? previewIndex : selectedIndex;
    }

    function renderDetail() {
      var i = displayIndex();
      var article = stashCardAt(i);
      if (!detailCard || !article) return;
      detailCard.innerHTML = article.innerHTML;
    }

    function updateRailActive() {
      var d = displayIndex();
      buttons.forEach(function (btn) {
        var bi = indexFromBtn(btn);
        btn.classList.toggle("is-active", bi === d);
      });
    }

    function setAriaForSelected(i) {
      if (!detailPanel) return;
      var btn = railButtonAt(i);
      if (btn && btn.id) {
        detailPanel.setAttribute("aria-labelledby", btn.id);
      }
    }

    function setSelectedIndex(i) {
      if (i < 0 || i > timelineMaxIndex() || !stashCardAt(i)) return;
      selectedIndex = i;
      previewIndex = null;
      renderDetail();
      updateRailActive();
      buttons.forEach(function (btn) {
        var bi = indexFromBtn(btn);
        btn.setAttribute("aria-selected", bi === i ? "true" : "false");
        btn.setAttribute("tabindex", bi === i ? "0" : "-1");
      });
      setAriaForSelected(i);
    }

    function setPreviewIndex(i) {
      if (i < 0 || i > timelineMaxIndex() || !stashCardAt(i)) return;
      previewIndex = i;
      renderDetail();
      updateRailActive();
    }

    function clearPreview() {
      if (previewIndex === null) return;
      previewIndex = null;
      renderDetail();
      updateRailActive();
    }

    timelineRoot.addEventListener("mouseleave", function () {
      clearPreview();
    });

    buttons.forEach(function (btn) {
      btn.addEventListener("mouseenter", function () {
        setPreviewIndex(indexFromBtn(btn));
      });
      btn.addEventListener("click", function () {
        setSelectedIndex(indexFromBtn(btn));
        btn.focus();
      });
      btn.addEventListener("focus", function () {
        setSelectedIndex(indexFromBtn(btn));
      });
    });

    var rail = timelineRoot.querySelector(".timeline-rail");
    if (rail) {
      rail.addEventListener("keydown", function (e) {
        var i = selectedIndex;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          var next = Math.min(i + 1, timelineMaxIndex());
          setSelectedIndex(next);
          var btnNext = railButtonAt(next);
          if (btnNext) btnNext.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          var prev = Math.max(i - 1, 0);
          setSelectedIndex(prev);
          var btnPrev = railButtonAt(prev);
          if (btnPrev) btnPrev.focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          setSelectedIndex(0);
          var btnHome = railButtonAt(0);
          if (btnHome) btnHome.focus();
        } else if (e.key === "End") {
          e.preventDefault();
          var last = timelineMaxIndex();
          setSelectedIndex(last);
          var btnEnd = railButtonAt(last);
          if (btnEnd) btnEnd.focus();
        }
      });
    }

    if (location.hash === "#education") {
      var eduBtn = document.getElementById("education");
      if (eduBtn) {
        var eduIdx = parseInt(eduBtn.getAttribute("data-timeline-index"), 10);
        if (!isNaN(eduIdx)) {
          setSelectedIndex(eduIdx);
          var reduceMotion =
            window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.requestAnimationFrame(function () {
            eduBtn.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
          });
        }
      }
    } else {
      setSelectedIndex(0);
    }
  }
})();
