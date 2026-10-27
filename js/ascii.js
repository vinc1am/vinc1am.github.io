(function () {
  "use strict";

  var SLIDES = {
    projects: { cmd: "open projects.app", path: "projects" },
    career: { cmd: "cat career.log", path: "career" },
    education: { cmd: "cat education.log", path: "education" },
    certs: { cmd: "open certs.db", path: "certs" }
  };

  var ORDER = ["projects", "career", "education", "certs"];

  var app = document.getElementById("app");
  var track = document.getElementById("slide-track");
  var cmdEl = document.getElementById("slide-cmd");
  var pathNav = document.getElementById("path-nav");
  var wrap = document.getElementById("slide-wrap");
  var mosaic = document.getElementById("ascii-mosaic");
  var welcome = document.querySelector(".welcome");
  var listProjects = document.getElementById("list-projects");
  var listCareer = document.getElementById("list-career");
  var listEducation = document.getElementById("list-education");
  var listCerts = document.getElementById("list-certs");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var active = null;
  var mode = "hero"; // hero | content
  var busy = false;
  var touchStartX = 0;

  function setPath(path) {
    document.querySelectorAll("[data-path]").forEach(function (btn) {
      var on = btn.getAttribute("data-path") === path;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
  }

  function reveal() {
    var nodes = document.querySelectorAll("[data-fade]");
    if (reduceMotion) {
      nodes.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }
    window.requestAnimationFrame(function () {
      nodes.forEach(function (el) {
        el.classList.add("is-in");
      });
    });
  }

  function setPanel(id) {
    if (track) track.setAttribute("data-active", id);
    /* Command text snaps — no flash / fade */
    if (cmdEl) {
      cmdEl.classList.remove("is-flash");
      cmdEl.textContent = SLIDES[id].cmd;
    }

    document.querySelectorAll("[data-slide-panel]").forEach(function (panel) {
      var on = panel.getAttribute("data-slide-panel") === id;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    });

    document.querySelectorAll("[data-dot]").forEach(function (dot) {
      dot.classList.toggle("is-active", dot.getAttribute("data-dot") === id);
    });

    if (SLIDES[id]) setPath(SLIDES[id].path);
    active = id;
  }

  function assembleRows(panelId) {
    var panel = document.querySelector('[data-slide-panel="' + panelId + '"]');
    if (!panel) return;
    var rows = panel.querySelectorAll(".term-row");
    rows.forEach(function (row, i) {
      row.classList.remove("is-assembled");
      row.style.setProperty("--assemble-delay", 40 + i * 55 + "ms");
      void row.offsetWidth;
      row.classList.add("is-assembled");
    });
  }

  function showContent(id) {
    mode = "content";
    if (app) {
      app.classList.remove("is-morphing");
      app.setAttribute("data-mode", "content");
    }
    setPanel(id);
    assembleRows(id);
  }

  function enterContent(id) {
    if (!SLIDES[id] || busy) return;

    // Already open — just switch panels
    if (mode === "content") {
      if (active === id) return;
      setPanel(id);
      assembleRows(id);
      return;
    }

    busy = true;
    /* Command + table immediately; mosaic dissolves in parallel */
    showContent(id);
    busy = false;

    if (window.AsciiMosaic && window.AsciiMosaic.dissolveOut) {
      window.AsciiMosaic.dissolveOut({ duration: 240 });
    }
  }

  function backToHero() {
    if (mode === "hero") {
      setPath("aboutme");
      return;
    }
    if (busy) return;

    busy = true;
    mode = "hero";
    active = null;

    document.querySelectorAll("[data-dot]").forEach(function (dot) {
      dot.classList.remove("is-active");
    });
    document.querySelectorAll("[data-slide-panel]").forEach(function (panel) {
      panel.classList.remove("is-active");
      panel.hidden = true;
    });
    setPath("aboutme");
    if (cmdEl) {
      cmdEl.classList.remove("is-flash");
      cmdEl.textContent = "cd ~";
    }

    if (app) {
      app.classList.remove("is-morphing");
      app.setAttribute("data-mode", "hero");
    }

    function done() {
      busy = false;
    }

    if (window.AsciiMosaic && window.AsciiMosaic.assembleIn) {
      window.AsciiMosaic.assembleIn({ duration: 240, onDone: done });
    } else {
      done();
    }
  }

  function shift(delta) {
    if (mode !== "content" || !active) {
      enterContent(ORDER[0]);
      return;
    }
    var i = ORDER.indexOf(active);
    var next = ORDER[(i + delta + ORDER.length) % ORDER.length];
    enterContent(next);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderProjects(projects) {
    if (!listProjects) return;
    listProjects.innerHTML = "";
    projects.forEach(function (p, i) {
      var li = el("li", "term-row");
      var a = document.createElement("a");
      a.className = "term-row__link";
      a.href = p.github || "#";
      if (p.github) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.appendChild(el("span", "term-row__idx", String(i + 1).padStart(2, "0")));
      a.appendChild(el("span", "term-row__name", p.name));
      a.appendChild(el("span", "term-row__mark", "->"));
      a.appendChild(el("span", "term-row__desc", p.description || ""));
      li.appendChild(a);
      listProjects.appendChild(li);
    });
  }

  function renderLogList(listEl, items) {
    if (!listEl) return;
    listEl.innerHTML = "";
    items.forEach(function (item) {
      var li = el("li", "term-row term-row--log");
      if (item.logo) {
        var mark = el(
          "div",
          "term-row__logo" + (item.logoTone === "dark" ? " term-row__logo--dark" : "")
        );
        var img = document.createElement("img");
        img.src = item.logo;
        img.alt = item.org || "";
        img.loading = "lazy";
        img.decoding = "async";
        if (item.logoScale) {
          img.style.transform = "scale(" + item.logoScale + ")";
        }
        mark.appendChild(img);
        li.appendChild(mark);
      } else {
        li.appendChild(el("div", "term-row__logo term-row__logo--empty"));
      }
      var body = el("div", "term-row__body");
      var head = el("div", "term-row__head");
      head.appendChild(el("p", "term-row__name", item.role));
      head.appendChild(el("span", "term-row__year", item.year));
      body.appendChild(head);
      body.appendChild(el("p", "term-row__org", item.org));
      if (item.grade) {
        body.appendChild(el("p", "term-row__grade", item.grade));
      }
      if (item.achievements && item.achievements.length) {
        var ul = el("ul", "term-achievements");
        item.achievements.forEach(function (line) {
          var row = el("li", "term-achievements__item");
          row.appendChild(el("span", "term-achievements__bullet", "-"));
          row.appendChild(el("span", null, line));
          ul.appendChild(row);
        });
        body.appendChild(ul);
      } else if (item.text) {
        body.appendChild(el("p", "term-row__desc", item.text));
      }
      li.appendChild(body);
      listEl.appendChild(li);
    });
  }

  function renderCerts(groups) {
    if (!listCerts) return;
    listCerts.innerHTML = "";
    groups.forEach(function (group) {
      var vendorKey = String(group.vendor || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      var li = el(
        "li",
        "term-row term-row--db" +
          (group.logo ? " term-row--db-logo" : "") +
          (vendorKey ? " term-row--db-" + vendorKey : "")
      );
      if (group.logo) {
        var mark = el("div", "term-row__watermark");
        var img = document.createElement("img");
        img.src = group.logo;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        mark.appendChild(img);
        li.appendChild(mark);
      }
      var body = el("div", "term-row__db-body");
      body.appendChild(el("p", "term-row__vendor", group.vendor));
      var ul = el("ul", "term-sub");
      group.items.forEach(function (name) {
        var sub = el("li", "term-sub__item");
        sub.appendChild(el("span", "term-sub__bullet", "-"));
        sub.appendChild(el("span", null, name));
        ul.appendChild(sub);
      });
      body.appendChild(ul);
      li.appendChild(body);
      listCerts.appendChild(li);
    });
  }

  function loadJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url);
      return res.json();
    });
  }

  function loadData() {
    Promise.all([
      loadJSON("data/projects.json"),
      loadJSON("data/experience.json"),
      loadJSON("data/certifications.json")
    ])
      .then(function (results) {
        var experience = results[1].experience || [];
        renderProjects(results[0].projects || []);
        renderLogList(
          listCareer,
          experience.filter(function (item) {
            return item.kind === "Career";
          })
        );
        renderLogList(
          listEducation,
          experience.filter(function (item) {
            return item.kind === "Education";
          })
        );
        renderCerts(results[2].certifications || []);
      })
      .catch(function () {
        if (listProjects) {
          listProjects.innerHTML =
            '<li class="term-row"><p class="term-row__desc">Unable to load workspace data.</p></li>';
        }
      });
  }

  if (pathNav) {
    pathNav.querySelectorAll("[data-path]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var path = btn.getAttribute("data-path");
        if (path === "aboutme") backToHero();
        else enterContent(path);
      });
    });
  }

  document.querySelectorAll("[data-dot]").forEach(function (dot) {
    dot.addEventListener("click", function () {
      enterContent(dot.getAttribute("data-dot"));
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      backToHero();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      shift(1);
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      if (mode === "content") shift(-1);
    }
    if (e.key === "1") enterContent("projects");
    if (e.key === "2") enterContent("career");
    if (e.key === "3") enterContent("education");
    if (e.key === "4") enterContent("certs");
  });

  if (wrap) {
    wrap.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    wrap.addEventListener(
      "touchend",
      function (e) {
        var dx = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(dx) < 48) return;
        shift(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );
  }

  if (app) app.setAttribute("data-mode", "hero");
  document.querySelectorAll("[data-slide-panel]").forEach(function (panel) {
    panel.hidden = true;
    panel.classList.remove("is-active");
  });
  setPath("aboutme");

  reveal();
  loadData();
})();
