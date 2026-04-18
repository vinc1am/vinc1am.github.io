(function () {
  "use strict";

  var GH_ICON = "assets/github-mark.svg";

  /** Keys in tags.section — must match data-filter on filter buttons */
  var FILTER_LABELS = {
    aiml: "AI & ML",
    nlp: "NLP",
    speech: "Speech",
    crawling: "Crawling",
    investment: "Investment",
    vis: "Data Visualisation",
  };

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var gridEl = document.getElementById("gallery-grid");
  var modal = document.getElementById("gallery-modal");
  var modalTitle = document.getElementById("gallery-modal-title");
  var modalGithub = document.getElementById("gallery-modal-github");
  var modalDetails = document.getElementById("gallery-modal-details");
  var modalTags = document.getElementById("gallery-modal-tags");
  var carouselImg = document.getElementById("gallery-carousel-img");
  var btnPrev = document.getElementById("gallery-carousel-prev");
  var btnNext = document.getElementById("gallery-carousel-next");
  var dotsEl = document.getElementById("gallery-carousel-dots");
  var btnClose = document.getElementById("gallery-modal-close");

  var allProjects = [];
  var carouselImages = [];
  var carouselIndex = 0;

  function projectMatchesFilter(project, filterKey) {
    var sec = project.tags && project.tags.section;
    if (!sec || !sec.length) return false;
    return sec.indexOf(filterKey) !== -1;
  }

  function getDefaultFilterKey() {
    var active = $(".gallery-filter-btn.is-active");
    if (active) return active.getAttribute("data-filter");
    var first = $(".gallery-filter-btn");
    return first ? first.getAttribute("data-filter") : "aiml";
  }

  function applyFilter(filterKey) {
    $all(".gallery-filter-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-filter") === filterKey);
    });
    var visible = 0;
    $all(".gallery-card", gridEl).forEach(function (card) {
      var id = card.getAttribute("data-project-id");
      var p = allProjects.filter(function (x) {
        return x.id === id;
      })[0];
      var show = p && projectMatchesFilter(p, filterKey);
      card.classList.toggle("is-hidden", !show);
      if (show) visible += 1;
    });
    var empty = document.getElementById("gallery-empty");
    if (empty) {
      empty.style.display = visible === 0 ? "block" : "none";
    }
  }

  function setCarouselSlide(index) {
    if (!carouselImages.length) return;
    carouselIndex = (index + carouselImages.length) % carouselImages.length;
    carouselImg.src = carouselImages[carouselIndex];
    carouselImg.alt = "Slide " + (carouselIndex + 1);
    $all(".gallery-carousel__dot", dotsEl).forEach(function (dot, i) {
      dot.classList.toggle("is-active", i === carouselIndex);
    });
  }

  function galleryUrls(project) {
    if (project.gallery && project.gallery.length) {
      return project.gallery.slice();
    }
    return project.heroImage ? [project.heroImage] : [];
  }

  function renderModalTags(project) {
    var tags = project.tags || {};
    var section = tags.section || [];
    var parts = [];

    section.forEach(function (key) {
      var label = FILTER_LABELS[key] || key;
      parts.push(
        '<span class="gallery-modal__tag gallery-modal__tag--section">' + escapeHtml(label) + "</span>"
      );
    });

    modalTags.innerHTML = parts.join("");
  }

  function openModal(project) {
    modalTitle.textContent = project.name;
    if (modalDetails) modalDetails.textContent = project.details || "";
    if (modalGithub) {
      if (project.github && String(project.github).trim().length) {
        modalGithub.href = project.github;
        modalGithub.hidden = false;
        modalGithub.setAttribute(
          "aria-label",
          "View " + project.name + " on GitHub (opens in a new tab)"
        );
      } else {
        modalGithub.hidden = true;
        modalGithub.removeAttribute("href");
      }
    }
    renderModalTags(project);

    carouselImages = galleryUrls(project);
    carouselIndex = 0;
    dotsEl.innerHTML = "";
    var multi = carouselImages.length > 1;
    if (btnPrev) btnPrev.style.display = multi ? "flex" : "none";
    if (btnNext) btnNext.style.display = multi ? "flex" : "none";
    dotsEl.style.display = multi ? "flex" : "none";

    carouselImages.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "gallery-carousel__dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("aria-label", "Go to slide " + (i + 1));
      dot.addEventListener("click", function () {
        setCarouselSlide(i);
      });
      dotsEl.appendChild(dot);
    });
    setCarouselSlide(0);

    if (modal.showModal) {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  }

  function closeModal() {
    if (modal.close) {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }

  if (btnClose) {
    btnClose.addEventListener("click", closeModal);
  }
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && typeof modal.open !== "undefined" && modal.open) {
      closeModal();
    }
  });

  if (btnPrev) {
    btnPrev.addEventListener("click", function () {
      setCarouselSlide(carouselIndex - 1);
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", function () {
      setCarouselSlide(carouselIndex + 1);
    });
  }

  function renderCard(project, index) {
    var card = document.createElement("div");
    card.className = "gallery-card gallery-card--enter";
    card.style.setProperty("--stagger", String(index));
    card.setAttribute("data-project-id", project.id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Open details: " + project.name);

    var ghHtml = "";
    if (project.github && project.github.length) {
      ghHtml =
        '<a class="gallery-card__gh" href="' +
        escapeHtml(project.github) +
        '" target="_blank" rel="noopener noreferrer" tabindex="0" aria-label="GitHub repository for ' +
        escapeHtml(project.name) +
        '"><img src="' +
        GH_ICON +
        '" width="22" height="22" alt=""></a>';
    }

    card.innerHTML =
      '<div class="gallery-card__media"><img src="' +
      escapeHtml(project.heroImage) +
      '" alt="" loading="lazy"><div class="gallery-card__overlay" aria-hidden="true"><span class="gallery-card__cta">View project</span><span class="gallery-card__cta-arrow" aria-hidden="true">→</span></div></div><div class="gallery-card__body"><div class="gallery-card__head"><h3 class="gallery-card__title">' +
      escapeHtml(project.name) +
      "</h3>" +
      ghHtml +
      '</div><p class="gallery-card__desc">' +
      escapeHtml(project.description) +
      "</p></div>";

    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      openModal(project);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!e.target.closest("a")) openModal(project);
      }
    });
    return card;
  }

  function initFilters() {
    $all(".gallery-filter-btn[data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-filter");
        applyFilter(key);
        try {
          history.replaceState(null, "", "index.html#featured");
        } catch (err) {
          /* ignore */
        }
      });
    });
  }

  fetch("data/projects.json")
    .then(function (r) {
      if (!r.ok) throw new Error("Failed to load projects");
      return r.json();
    })
    .then(function (data) {
      allProjects = data.projects || [];
      if (!gridEl) return;
      allProjects.forEach(function (p, i) {
        gridEl.appendChild(renderCard(p, i));
      });
      var empty = document.createElement("p");
      empty.id = "gallery-empty";
      empty.className = "gallery-empty";
      empty.textContent = "No projects match this filter.";
      empty.style.display = "none";
      gridEl.appendChild(empty);

      initFilters();

      applyFilter(getDefaultFilterKey());
    })
    .catch(function () {
      if (gridEl) {
        gridEl.innerHTML =
          '<p class="gallery-empty">Could not load projects. Ensure <code>data/projects.json</code> is deployed with the site.</p>';
      }
    });
})();
