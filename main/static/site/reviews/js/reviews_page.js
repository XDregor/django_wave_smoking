      if (typeof window.__waveReviewsPageCleanup === "function") {
        window.__waveReviewsPageCleanup();
      }
      var reviewsPageController = new AbortController();
      var reviewsPageSignal = reviewsPageController.signal;
      window.__waveReviewsPageCleanup = (function (controller) {
        var cleanup = function () {
          if (typeof window.__waveReviewsModalCleanup === "function") {
            window.__waveReviewsModalCleanup();
          }
          controller.abort();
          document.documentElement.style.removeProperty("--reviews-page__sidebar-shift");
          document.documentElement.style.removeProperty("--reviews-sidebar-left");
          document.documentElement.style.removeProperty("--reviews-sidebar-width");
          if (window.__waveReviewsPageCleanup === cleanup) {
            window.__waveReviewsPageCleanup = null;
            window.waveReviewsFilterClick = null;
          }
        };
        return cleanup;
      })(reviewsPageController);
      window.addEventListener("wave:page-leave", window.__waveReviewsPageCleanup, {
        once: true,
        signal: reviewsPageSignal,
      });

function starSvg(fill, sz) {
        return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="' + fill + '"/></svg>';
      }
      function renderStars(r, sz) {
        sz = sz || 16;
        return Array.from({ length: 5 }, function (_, i) {
          return starSvg(i < r ? "var(--buda)" : "rgba(255,255,255,.12)", sz);
        }).join("");
      }
      function renderStarsFloat(r, sz) {
        var full = Math.floor(r),
          half = r - full >= 0.3;
        return Array.from({ length: 5 }, function (_, i) {
          if (i < full) return starSvg("var(--buda)", sz);
          if (i === full && half) return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24"><defs><linearGradient id="hg' + sz + '"><stop offset="50%" stop-color="var(--buda)"/><stop offset="50%" stop-color="rgba(255,255,255,.12)"/></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#hg' + sz + ')"/></svg>';
          return starSvg("rgba(255,255,255,.12)", sz);
        }).join("");
      }

      var REVIEWS_DATA = JSON.parse(document.getElementById("reviewsData").textContent);
      var PRODUCTS_DATA = JSON.parse(document.getElementById("reviewProductsData").textContent);
      var RATING_SUMMARY = JSON.parse(document.getElementById("ratingSummaryData").textContent);

      function getCookie(name) {
        var value = "; " + document.cookie;
        var parts = value.split("; " + name + "=");
        return parts.length === 2 ? parts.pop().split(";").shift() : "";
      }

      function escapeHtml(value) {
        return String(value || "").replace(/[&<>"]/g, function (char) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
        });
      }

      function isMobileReviewsLayout() {
        return window.matchMedia("(max-width: 640px)").matches;
      }

      function getReviewStats() {
        var total = REVIEWS_DATA.length;
        var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        var verified = 0;
        var sum = 0;
        REVIEWS_DATA.forEach(function (review) {
          var rating = Number(review.rating || 0);
          if (counts[rating] !== undefined) counts[rating] += 1;
          if (review.verified) verified += 1;
          sum += rating;
        });
        return {
          total: total,
          counts: counts,
          verified: verified,
          average: total ? sum / total : 0,
        };
      }


      function updateReviewSummary() {
        var stats = getReviewStats();
        var bars = [5, 4, 3, 2, 1].map(function (stars) {
          var count = stats.counts[stars] || 0;
          return {
            stars: stars,
            count: count,
            pct: stats.total ? Math.round((count / stats.total) * 100) : 0,
          };
        });

        document.querySelectorAll(".reviews-summary__score").forEach(function (el) {
          el.textContent = stats.average.toFixed(1);
        });
        document.querySelectorAll(".reviews-summary").forEach(function (el) {
          var ratingPercent = Math.max(0, Math.min(100, Math.round((stats.average / 5) * 100)));
          el.style.setProperty("--reviews-rating-pct", ratingPercent + "%");
        });
        document.querySelectorAll(".reviews-mobile-rating").forEach(function (el) {
          var ratingPercent = Math.max(0, Math.min(100, Math.round((stats.average / 5) * 100)));
          el.style.setProperty("--reviews-rating-value", ratingPercent);
        });
        document.querySelectorAll("[data-mobile-rating-score]").forEach(function (el) {
          el.textContent = stats.average.toFixed(1);
        });
        document.querySelectorAll("[data-mobile-rating-sub]").forEach(function (el) {
          el.innerHTML = "<b>" + stats.total + "</b> \u043e\u0442\u0437\u044b\u0432\u043e\u0432";
        });
        document.querySelectorAll(".reviews-summary__sub").forEach(function (el) {
          el.innerHTML = "&middot; " + stats.total + " отзывов";
        });
        document.querySelectorAll('[data-filter="all"] .reviews-filters__badge').forEach(function (el) {
          el.textContent = stats.total;
        });
        [5, 4, 3, 2, 1].forEach(function (n) {
          document.querySelectorAll('[data-filter="' + n + '"] .reviews-filters__badge').forEach(function (el) {
            el.textContent = stats.counts[n] || 0;
          });
        });
        document.querySelectorAll('[data-filter="verified"] .reviews-filters__badge').forEach(function (el) {
          el.textContent = stats.verified;
        });

        var heroStarsEl = document.getElementById("heroStars");
        var summaryStarsEl = document.getElementById("summaryStars");
        var ratingBarsEl = document.getElementById("ratingBars");

        if (heroStarsEl) heroStarsEl.innerHTML = renderStarsFloat(stats.average, 18);
        if (summaryStarsEl) summaryStarsEl.innerHTML = renderStarsFloat(stats.average, 18);
        [5, 4, 3, 2, 1].forEach(function (n) {
          var el = document.getElementById("fs" + n);
          if (el) el.innerHTML = renderStars(n, 14);
        });

        if (ratingBarsEl) {
          ratingBarsEl.innerHTML = bars.map(function (b) {
            return '<div class="bar-row"><span class="bar-num">' + b.stars + '</span><div class="bar-track"><div class="bar-fill" data-pct="' + b.pct + '"></div></div><span class="bar-cnt">' + b.count + "</span></div>";
          }).join("");
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              ratingBarsEl.querySelectorAll(".bar-fill").forEach(function (el, i) {
                el.style.transitionDelay = i * 0.07 + "s";
                el.style.width = el.dataset.pct + "%";
              });
            });
          });
        }
        var mobileRatingBarsEl = document.getElementById("mobileRatingBars");
        if (mobileRatingBarsEl) {
          mobileRatingBarsEl.innerHTML = bars.map(function (b) {
            return '<div class="bar-row"><span class="bar-num">' + b.stars + '</span><div class="bar-track"><div class="bar-fill" data-pct="' + b.pct + '"></div></div><span class="bar-cnt">' + b.count + "</span></div>";
          }).join("");
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              mobileRatingBarsEl.querySelectorAll(".bar-fill").forEach(function (el, i) {
                el.style.transitionDelay = i * 0.07 + "s";
                el.style.width = el.dataset.pct + "%";
              });
            });
          });
        }
      }


      function renderReviews(data) {
        var el = document.getElementById("reviewsList");
        if (!el) return;
        if (!data.length) {
          el.innerHTML = '<div class="reviews-empty"><img class="reviews-empty__illustration" src="/static/site/shared/img/reviews_empty.svg" alt="" loading="lazy" decoding="async"><p class="reviews-empty__title">Отзывы не найдены</p></div>';
          return;
        }
        var checkIcon =
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 19L16 22L21 17" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 22H7C5.89543 22 5 21.1046 5 20V11.1817C5 11.0632 4.96494 10.9474 4.89923 10.8488L3.10077 8.15115C3.03506 8.05259 3 7.93679 3 7.81833V2.6C3 2.26863 3.26863 2 3.6 2H5.4C5.73137 2 6 2.26863 6 2.6V4.4C6 4.73137 6.26863 5 6.6 5H9.4C9.73137 5 10 4.73137 10 4.4V2.6C10 2.26863 10.2686 2 10.6 2H13.4C13.7314 2 14 2.26863 14 2.6V4.4C14 4.73137 14.2686 5 14.6 5H17.4C17.7314 5 18 4.73137 18 4.4V2.6C18 2.26863 18.2686 2 18.6 2H20.4C20.7314 2 21 2.26863 21 2.6V7.81833C21 7.93679 20.9649 8.05259 20.8992 8.15115L19.1008 10.8488C19.0351 10.9474 19 11.0632 19 11.1817V13.5" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        var likeIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 011.92 2.56l-2.33 8A2 2 0 0117.5 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h2.76a2 2 0 001.79-1.11L12 2a3.13 3.13 0 013 3.88z"/></svg>';

        function productTagMarkup(review) {
          var productName = escapeHtml(review.product || "Товар");
          if (review.product_available !== false && review.product_url) {
            return (
              '<a class="review-card__product-tag" href="' +
              escapeHtml(review.product_url) +
              '" aria-label="Открыть товар: ' +
              productName +
              '">' +
              productName +
              "</a>"
            );
          }
          return (
            '<button class="review-card__product-tag is-unavailable" type="button" data-review-product-unavailable>' +
            productName +
            "</button>"
          );
        }

        el.innerHTML = data
          .map(function (r, i) {
            var trunc = (r.text || "").length > 220;
            if (isMobileReviewsLayout()) {
              return (
                '<article class="review-card review-card--mobile" data-id="' +
                r.id +
                '">' +
                '<div class="review-card__top">' +
                '<div class="review-card__avatar c1">' +
                escapeHtml(r.avatar) +
                "</div>" +
                '<div class="review-card__info">' +
                '<div class="review-card__name-row"><span class="review-card__name">' +
                escapeHtml(r.name) +
                "</span>" +
                (r.verified ? '<span class="review-card__verified" title="РџСЂРѕРІРµСЂРµРЅРЅС‹Р№ РїРѕРєСѓРїР°С‚РµР»СЊ">' + checkIcon + "</span>" : "") +
                "</div>" +
                '<div class="review-card__meta-row"><span class="review-card__date">' +
                escapeHtml(r.date) +
                "</span></div>" +
                "</div>" +
                '<div class="review-card__stars">' +
                renderStars(r.rating, 13) +
                "</div>" +
                "</div>" +
                productTagMarkup(r) +
                '<p class="review-card__text' +
                (trunc ? " truncated" : "") +
                '" id="rt_' +
                r.id +
                '">' +
                escapeHtml(r.text) +
                "</p>" +
                (trunc ? '<button class="review-card__read-more" onclick="toggleText(' + r.id + ',this)">Р§РёС‚Р°С‚СЊ РїРѕР»РЅРѕСЃС‚СЊСЋ &rarr;</button>' : "") +
                '<div class="review-card__footer"><div class="review-card__helpful"><div class="review-card__vote-actions">' +
                '<button class="helpful-btn review-card__vote' +
                (r.liked ? " is-liked" : "") +
                '" data-review-helpful-id="' +
                r.id +
                '" onclick="vote(this,' +
                r.id +
                ')">' +
                '<span class="helpful-btn__icon">' +
                likeIcon +
                "</span>" +
                "<span>\u041f\u043e\u043b\u0435\u0437\u043d\u043e</span></button>" +
                "</div></div></div>" +
                "</article>"
              );
            }
            return (
              '<article class="review-card" style="animation-delay:' +
              (window.innerWidth > 860 ? i * 0.15 : 0) +
              's" data-id="' +
              r.id +
              '">' +
              '<div class="review-card__top">' +
              '<div class="review-card__avatar c1">' +
              escapeHtml(r.avatar) +
              "</div>" +
              '<div class="review-card__info">' +
              '<div class="review-card__name-row"><span class="review-card__name">' +
              escapeHtml(r.name) +
              "</span>" +
              (r.verified ? '<span class="review-card__verified" title="Проверенный покупатель">' + checkIcon + "</span>" : "") +
              "</div>" +
              '<div class="review-card__meta-row"><span class="review-card__date">' +
              escapeHtml(r.date) +
              "</span>" +
              productTagMarkup(r) +
              "</div></div>" +
              '<div class="review-card__stars">' +
              renderStars(r.rating, 16) +
              "</div>" +
              "</div>" +
              '<p class="review-card__text' +
              (trunc ? " truncated" : "") +
              '" id="rt_' +
              r.id +
              '">' +
              escapeHtml(r.text) +
              "</p>" +
              (trunc ? '<button class="review-card__read-more" onclick="toggleText(' + r.id + ',this)">Читать полностью &rarr;</button>' : "") +
              '<div class="review-card__footer"><div class="review-card__helpful"><span class="review-card__helpful-label">Полезно?</span><div class="review-card__vote-actions">' +
               '<button class="review-card__vote' +
               (r.liked ? " is-liked" : "") +
               '" data-review-helpful-id="' +
               r.id +
               '" onclick="vote(this,' +
               r.id +
               ')">' +
              likeIcon +
              "<span>" +
              Number(r.helpful || 0) +
              "</span></button>" +
              "</div></div></div>" +
              "</article>"
            );
          })
          .join("");
      }

      function showUnavailableProductMessage() {
        var previous = document.querySelector(".reviews-product-toast");
        if (previous) previous.remove();

        var toast = document.createElement("div");
        toast.className = "reviews-product-toast";
        toast.setAttribute("role", "status");
        toast.textContent = "Извините, этот товар сейчас недоступен.";
        document.body.appendChild(toast);
        requestAnimationFrame(function () {
          toast.classList.add("is-visible");
        });
        window.setTimeout(function () {
          toast.classList.remove("is-visible");
          window.setTimeout(function () {
            toast.remove();
          }, 260);
        }, 2800);
      }

      document.addEventListener("click", function (event) {
        if (!event.target.closest("[data-review-product-unavailable]")) return;
        showUnavailableProductMessage();
      }, { signal: reviewsPageSignal });


      function toggleText(id, btn) {
        var el = document.getElementById("rt_" + id);
        el.classList.toggle("truncated");
        btn.textContent = el.classList.contains("truncated") ? "Читать полностью →" : "Свернуть ↑";
      }

      async function vote(btn, id) {
        var response = await fetch("/api/reviews/" + id + "/vote/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ vote: "up" }),
        });
        var data = await response.json().catch(function () {
          return {};
        });
        if (!response.ok) return;

        var review = REVIEWS_DATA.find(function (item) {
          return Number(item.id) === Number(id);
        });
        if (review) {
          review.helpful = data.helpful;
          review.liked = data.liked;
        }
        btn.classList.toggle("is-liked", !!data.liked);
        btn.classList.remove("is-vote-changing");
        void btn.offsetWidth;
        btn.classList.add("is-vote-changing");
        window.setTimeout(function () {
          btn.classList.remove("is-vote-changing");
        }, 430);
        var counter = btn.querySelector("span");
        if (counter && !btn.classList.contains("helpful-btn")) counter.textContent = data.helpful;
      }


      var activeFilter = "all";
      var activeRating = 0;
      var verifiedOnly = false;
      var currentPage = 1;
      var perPage = 20;
      var filteredData = REVIEWS_DATA.slice();
      var lastReviewsLayoutMode = isMobileReviewsLayout() ? "mobile" : "desktop";

      function syncReviewsSidebarGeometry() {
        var root = document.documentElement;
        var sidebar = document.querySelector(".reviews-page__sidebar");
        if (!sidebar || !window.matchMedia("(min-width: 861px)").matches) {
          root.style.removeProperty("--reviews-sidebar-left");
          root.style.removeProperty("--reviews-sidebar-width");
          return;
        }

        var sidebarRect = sidebar.getBoundingClientRect();
        root.style.setProperty("--reviews-sidebar-left", sidebarRect.left + "px");
        root.style.setProperty("--reviews-sidebar-width", sidebarRect.width + "px");
      }

      function updateReviewsSidebarPosition() {
        var header = document.querySelector("[data-header], .site-header, .page_header");
        var isHeaderHidden = document.body.classList.contains("is-header-hidden")
          || (header && (header.classList.contains("is-hidden") || header.classList.contains("page_header_hidden")));
        var headerHeight = header ? Math.round(header.getBoundingClientRect().height) : 90;
        document.documentElement.style.setProperty(
          "--reviews-page__sidebar-shift",
          isHeaderHidden ? "-" + headerHeight + "px" : "0px"
        );
      }

      window.addEventListener("scroll", updateReviewsSidebarPosition, { passive: true, signal: reviewsPageSignal });
      window.addEventListener("resize", updateReviewsSidebarPosition, { signal: reviewsPageSignal });
      window.addEventListener("resize", syncReviewsSidebarGeometry, { signal: reviewsPageSignal });
      window.addEventListener("info-line-header-hidden", updateReviewsSidebarPosition, { signal: reviewsPageSignal });
      window.addEventListener("info-line-restore", updateReviewsSidebarPosition, { signal: reviewsPageSignal });
      window.addEventListener("resize", function () {
        var nextMode = isMobileReviewsLayout() ? "mobile" : "desktop";
        if (!isMobileReviewsLayout()) {
          var modalBackdrop = document.getElementById("modalBackdrop");
          var modalElement = modalBackdrop?.querySelector(".modal");
          modalBackdrop?.classList.remove("is-expanded", "is-dragging");
          modalElement?.style.removeProperty("height");
          modalElement?.style.removeProperty("max-height");
        }
        if (nextMode === lastReviewsLayoutMode) return;
        lastReviewsLayoutMode = nextMode;
        showPage.shouldScroll = false;
        showPage();
      }, { signal: reviewsPageSignal });

      function renderPagination(total) {
        var totalPages = Math.ceil(total / perPage);
        var el = document.getElementById("reviewsPagination");
        if (!el) return;
        var paginationRoot = el.closest("[data_pagination_component_wrapper]");
        function renderPaginationTemplate(name, values) {
          values = values || {};
          var tpl = paginationRoot ? paginationRoot.querySelector('[data_pagination_template_name="' + name + '"]') : null;
          if (!tpl) return "";
          var markup = tpl.innerHTML.trim();
          Object.keys(values).forEach(function (key) {
            markup = markup.split("__" + key + "__").join(values[key]);
          });
          return markup;
        }
        if (totalPages <= 1) {
          el.innerHTML = "";
          return;
        }

        var html = "";
        html += renderPaginationTemplate("prev");

        var range = [];
        for (var i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) range.push(i);
          else if (range[range.length - 1] !== "…") range.push("…");
        }
        range.forEach(function (r) {
          if (r === "…") {
            html += renderPaginationTemplate("dots");
          } else {
            html += renderPaginationTemplate("page", {
              PAGE: r,
              ACTIVE_CLASS: r === currentPage ? "active" : "",
            });
          }
        });

        html += renderPaginationTemplate("next");

        el.innerHTML = html;

        el.querySelectorAll("[data_pagination_page_number]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            currentPage = +btn.getAttribute("data_pagination_page_number");
            showPage();
          });
        });
        var prev = el.querySelector("[data_pagination_prev_button]");
        var next = el.querySelector("[data_pagination_next_button]");
        if (prev) {
          prev.disabled = currentPage === 1;
          prev.addEventListener("click", function () {
            currentPage--;
            showPage();
          });
        }
        if (next) {
          next.disabled = currentPage === totalPages;
          next.addEventListener("click", function () {
            currentPage++;
            showPage();
          });
        }
      }

      function showPage() {
        if (!document.getElementById("reviewsList")) return;
        var start = (currentPage - 1) * perPage;
        var pageData = filteredData.slice(start, start + perPage);
        renderReviews(pageData);
        var shownCount = document.getElementById("shownCount");
        if (shownCount) shownCount.textContent = filteredData.length;
        renderPagination(filteredData.length);
        if (showPage.shouldScroll) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        showPage.shouldScroll = true;
      }
      function setupReviewFilters() {
        var filterList = document.getElementById("filterBtns");
        if (!filterList) return;
        filterList.dataset.filtersReady = "true";
        var pointerStart = null;

        var mobileFilter = filterList.querySelector("[data-mobile-review-filter]");
        mobileFilter?.querySelectorAll("[data-mobile-filter-rating]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var rating = Number(btn.dataset.mobileFilterRating || 0);
            activeRating = activeRating === rating ? 0 : rating;
            activeFilter = activeRating ? String(activeRating) : verifiedOnly ? "verified" : "all";
            applyFilter();
          }, { signal: reviewsPageSignal });
        });
        mobileFilter?.querySelector("[data-mobile-filter-verified]")?.addEventListener("click", function () {
          verifiedOnly = !verifiedOnly;
          activeFilter = activeRating ? String(activeRating) : verifiedOnly ? "verified" : "all";
          applyFilter();
        }, { signal: reviewsPageSignal });
        mobileFilter?.querySelector("[data-mobile-filter-all]")?.addEventListener("click", function () {
          activeRating = 0;
          verifiedOnly = false;
          activeFilter = "all";
          applyFilter();
        }, { signal: reviewsPageSignal });

        filterList.querySelectorAll(".reviews-filters__button").forEach(function (btn) {
          btn.type = "button";
        });
        filterList.onpointerdown = function (e) {
          var btn = e.target.closest(".reviews-filters__button");
          if (!btn || !filterList.contains(btn)) return;
          pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
        };
        filterList.onpointerup = function (e) {
          var btn = e.target.closest(".reviews-filters__button");
          if (!btn || !filterList.contains(btn)) return;
          if (pointerStart && pointerStart.id === e.pointerId) {
            var distance = Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y);
            pointerStart = null;
            if (distance > 8) return;
          }
          e.preventDefault();
          e.stopPropagation();
          selectReviewFilter(btn);
        };
        filterList.onclick = function (e) {
          var btn = e.target.closest(".reviews-filters__button");
          if (!btn || !filterList.contains(btn)) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.detail === 0) selectReviewFilter(btn);
        };
      }

      function selectReviewFilter(btn) {
        activeFilter = String(btn.dataset.filter || "all");
        activeRating = !isNaN(activeFilter) ? Number(activeFilter) : 0;
        verifiedOnly = activeFilter === "verified";
        applyFilter();
        try {
          btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } catch (error) {}
      }

      window.waveReviewsFilterClick = function (event, btn) {
        var filterList = document.getElementById("filterBtns");
        if (!btn || !filterList || !filterList.contains(btn)) return false;
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
        }
        selectReviewFilter(btn);
        return false;
      };

      document.addEventListener("click", function (event) {
        var btn = event.target.closest("#filterBtns .reviews-filters__button");
        if (!btn || typeof window.waveReviewsFilterClick !== "function") return;
        window.waveReviewsFilterClick(event, btn);
      }, { capture: true, signal: reviewsPageSignal });

      function isVerifiedReview(review) {
        return review.verified === true || review.verified === "true" || review.is_verified === true || review.is_verified === "true";
      }

      function syncReviewFilterControls() {
        document.querySelectorAll(".reviews-filters__button").forEach(function (btn) {
          var filter = String(btn.dataset.filter || "all");
          var selected = filter === "all"
            ? activeRating === 0 && !verifiedOnly
            : filter === "verified"
              ? verifiedOnly
              : Number(filter) === activeRating;
          btn.classList.toggle("is-active", selected);
        });

        var mobileFilter = document.querySelector("[data-mobile-review-filter]");
        if (!mobileFilter) return;

        mobileFilter.querySelectorAll("[data-mobile-filter-rating]").forEach(function (btn) {
          var rating = Number(btn.dataset.mobileFilterRating || 0);
          btn.classList.toggle("is-on", activeRating > 0 && rating <= activeRating);
          btn.setAttribute("aria-pressed", rating === activeRating ? "true" : "false");
        });

        var verifiedButton = mobileFilter.querySelector("[data-mobile-filter-verified]");
        verifiedButton?.classList.toggle("is-on", verifiedOnly);
        verifiedButton?.setAttribute("aria-pressed", verifiedOnly ? "true" : "false");

        var allButton = mobileFilter.querySelector("[data-mobile-filter-all]");
        var allSelected = activeRating === 0 && !verifiedOnly;
        allButton?.classList.toggle("is-active", allSelected);
        allButton?.setAttribute("aria-pressed", allSelected ? "true" : "false");
      }

      function applyFilter() {
        var data = REVIEWS_DATA.slice();
        if (activeRating)
          data = data.filter(function (r) {
            return Number(r.rating) === activeRating;
          });
        if (verifiedOnly)
          data = data.filter(function (r) {
            return isVerifiedReview(r);
          });
        filteredData = data;
        currentPage = 1;
        syncReviewFilterControls();
        showPage();
      }

      function setupReviewsFilterScroll() {
        var list = document.getElementById("filterBtns");
        if (!list) return;
        list.addEventListener("wheel", function (event) {
          if (!isMobileReviewsLayout()) return;
          var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          if (!delta) return;
          var maxScroll = list.scrollWidth - list.clientWidth;
          if (maxScroll <= 0) return;
          var nextScroll = Math.max(0, Math.min(maxScroll, list.scrollLeft + delta));
          if (nextScroll === list.scrollLeft) return;
          event.preventDefault();
          list.scrollLeft = nextScroll;
        }, { passive: false, signal: reviewsPageSignal });
      }

      function setupMobileRatingModule() {
        var summary = document.querySelector("[data-mobile-rating-module]");
        if (!summary) return;
        var mobileQuery = window.matchMedia("(max-width: 640px)");
        var trigger = summary.querySelector("[data-mobile-rating-toggle]") || summary;
        function syncSummaryMode() {
          if (mobileQuery.matches) {
            trigger.setAttribute("role", "button");
            trigger.setAttribute("tabindex", "0");
            summary.setAttribute("aria-expanded", summary.classList.contains("is-expanded") ? "true" : "false");
          } else {
            summary.classList.remove("is-expanded");
            trigger.removeAttribute("role");
            trigger.removeAttribute("tabindex");
            summary.removeAttribute("aria-expanded");
          }
        }
        function toggleSummary() {
          var isExpanded = summary.classList.toggle("is-expanded");
          summary.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        }
        trigger.addEventListener("click", function (event) {
          if (!mobileQuery.matches) return;
          if (event.target.closest(".reviews-filters__button")) return;
          toggleSummary();
        });
        trigger.addEventListener("keydown", function (event) {
          if (!mobileQuery.matches) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleSummary();
        });
        if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", syncSummaryMode);
        else mobileQuery.addListener(syncSummaryMode);
        syncSummaryMode();
      }

      var backdrop = document.getElementById("modalBackdrop");
      var reviewModal = backdrop?.querySelector(".modal");
      var reviewModalHandle = document.querySelector("[data-review-modal-handle]");
      var modalOriginalParent = backdrop?.parentNode || null;
      var modalOriginalNextSibling = backdrop?.nextSibling || null;
      var reviewModalCollapsedHeight = 0;
      var reviewModalHeightTimer = 0;
      var reviewModalScrollTouchY = 0;
      var reviewModalScrollGrowTimer = 0;
      var reviewModalScrollFrame = 0;
      var reviewModalScrollTargetHeight = 0;
      var reviewModalCloseTimer = 0;
      var reviewModalOpener = null;

      function stopReviewModalScrollAnimation() {
        window.clearTimeout(reviewModalScrollGrowTimer);
        reviewModalScrollGrowTimer = 0;
        if (reviewModalScrollFrame) window.cancelAnimationFrame(reviewModalScrollFrame);
        reviewModalScrollFrame = 0;
        reviewModalScrollTargetHeight = 0;
      }

      function moveModalToTopLayer() {
        if (!backdrop || backdrop.parentNode === document.body) return;
        document.body.appendChild(backdrop);
      }
      function restoreModalPlacement() {
        if (!backdrop || !modalOriginalParent || !modalOriginalParent.isConnected) return;
        if (modalOriginalNextSibling && modalOriginalNextSibling.parentNode === modalOriginalParent) {
          modalOriginalParent.insertBefore(backdrop, modalOriginalNextSibling);
          return;
        }
        modalOriginalParent.appendChild(backdrop);
      }
      function openModal() {
        reviewModalOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        moveModalToTopLayer();
        window.clearTimeout(reviewModalHeightTimer);
        window.clearTimeout(reviewModalCloseTimer);
        stopReviewModalScrollAnimation();
        window.clearTimeout(reviewProductMenuTimer);
        window.clearTimeout(reviewProductExpandTimer);
        backdrop.classList.remove("is-expanded");
        backdrop.classList.remove("is-dragging");
        reviewModal?.classList.remove("is-product-clearing", "is-product-expanding", "is-product-picking");
        reviewModal?.style.removeProperty("height");
        reviewModal?.style.removeProperty("max-height");
        reviewModal?.style.removeProperty("min-height");
        backdrop.inert = false;
        backdrop.setAttribute("aria-hidden", "false");
        backdrop.classList.add("open");
        document.body.style.overflow = "hidden";
        window.requestAnimationFrame(function () {
          reviewModalCollapsedHeight = reviewModal?.getBoundingClientRect().height || 0;
          reviewModalHandle?.focus({ preventScroll: true });
        });
      }
      function closeModal() {
        window.clearTimeout(reviewModalHeightTimer);
        window.clearTimeout(reviewModalCloseTimer);
        stopReviewModalScrollAnimation();
        window.clearTimeout(reviewProductMenuTimer);
        window.clearTimeout(reviewProductExpandTimer);
        if (backdrop.contains(document.activeElement)) document.activeElement.blur();
        backdrop.classList.remove("open", "is-expanded", "is-dragging");
        backdrop.setAttribute("aria-hidden", "true");
        backdrop.inert = true;
        reviewModal?.classList.remove("is-product-clearing", "is-product-expanding", "is-product-picking");
        reviewModalCloseTimer = window.setTimeout(function () {
          reviewModal?.style.removeProperty("height");
          reviewModal?.style.removeProperty("max-height");
          reviewModal?.style.removeProperty("min-height");
        }, 440);
        document.body.style.overflow = "";
        if (reviewModalOpener?.isConnected) reviewModalOpener.focus({ preventScroll: true });
        reviewModalOpener = null;
        window.setTimeout(restoreModalPlacement, 450);
      }
      window.__waveReviewsModalCleanup = function () {
        stopReviewModalScrollAnimation();
        window.clearTimeout(reviewModalHeightTimer);
        window.clearTimeout(reviewModalCloseTimer);
        window.clearTimeout(reviewProductMenuTimer);
        window.clearTimeout(reviewProductExpandTimer);
        backdrop?.classList.remove("open", "is-expanded", "is-dragging");
        backdrop?.setAttribute("aria-hidden", "true");
        if (backdrop) backdrop.inert = true;
        reviewModal?.classList.remove("is-product-clearing", "is-product-expanding", "is-product-picking");
        reviewModal?.style.removeProperty("height");
        reviewModal?.style.removeProperty("max-height");
        reviewModal?.style.removeProperty("min-height");
        document.body.style.overflow = "";
        restoreModalPlacement();
        window.__waveReviewsModalCleanup = null;
      };
      function getReviewModalViewportHeight() {
        return Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
      }
      function getReviewModalCurrentHeight() {
        return reviewModal?.getBoundingClientRect().height || 0;
      }
      function applyReviewModalInteractiveHeight(height) {
        if (!backdrop || !reviewModal || !isMobileReviewsLayout()) return false;
        var viewportHeight = getReviewModalViewportHeight();
        if (!viewportHeight) return false;
        var nextHeight = Math.max(80, Math.min(viewportHeight, height));
        reviewModal.style.maxHeight = "100dvh";
        reviewModal.style.height = nextHeight + "px";
        var isFull = nextHeight >= viewportHeight - 2;
        backdrop.classList.toggle("is-expanded", isFull);
        reviewModalHandle?.setAttribute("aria-label", isFull ? "Свернуть окно отзыва" : "Развернуть окно отзыва");
        return isFull;
      }

      function getReviewModalSnapHeights() {
        var viewportHeight = getReviewModalViewportHeight();
        var collapsedHeight = Math.min(
          viewportHeight,
          reviewModalCollapsedHeight || getReviewModalCurrentHeight()
        );
        return [0, 0.2, 0.4, 0.6, 0.8, 1]
          .map(function (progress) {
            return Math.round(
              collapsedHeight + (viewportHeight - collapsedHeight) * progress
            );
          })
          .filter(function (height, index, heights) {
            return index === 0 || height - heights[index - 1] >= 8;
          });
      }

      function snapReviewModalToHeight(targetHeight) {
        if (!backdrop || !reviewModal) return;
        window.clearTimeout(reviewModalHeightTimer);
        var currentHeight = getReviewModalCurrentHeight();
        var viewportHeight = getReviewModalViewportHeight();
        var nextHeight = Math.max(80, Math.min(viewportHeight, targetHeight));
        var isFull = nextHeight >= viewportHeight - 2;
        backdrop.classList.remove("is-dragging");
        reviewModal.style.maxHeight = "100dvh";
        reviewModal.style.height = currentHeight + "px";
        reviewModal.offsetHeight;
        backdrop.classList.toggle("is-expanded", isFull);
        reviewModal.style.height = nextHeight + "px";
        reviewModalHandle?.setAttribute("aria-label", isFull ? "Свернуть окно отзыва" : "Развернуть окно отзыва");
      }

      function queueReviewModalInteractiveHeight(height) {
        if (!reviewModal) return;
        var viewportHeight = getReviewModalViewportHeight();
        reviewModalScrollTargetHeight = Math.max(80, Math.min(viewportHeight, height));
        backdrop.classList.add("is-dragging");
        if (reviewModalScrollFrame) return;

        function animateReviewModalHeight() {
          if (!reviewModal || !reviewModalScrollTargetHeight) {
            reviewModalScrollFrame = 0;
            return;
          }
          var currentHeight = getReviewModalCurrentHeight();
          var distance = reviewModalScrollTargetHeight - currentHeight;
          var nextHeight = Math.abs(distance) < 0.75
            ? reviewModalScrollTargetHeight
            : currentHeight + distance * 0.42;
          applyReviewModalInteractiveHeight(nextHeight);
          if (Math.abs(reviewModalScrollTargetHeight - nextHeight) >= 0.75) {
            reviewModalScrollFrame = window.requestAnimationFrame(animateReviewModalHeight);
          } else {
            reviewModalScrollFrame = 0;
          }
        }

        reviewModalScrollFrame = window.requestAnimationFrame(animateReviewModalHeight);
      }

      function settleReviewModalAfterInteraction() {
        if (!backdrop || !reviewModal || !backdrop.classList.contains("open")) return;
        stopReviewModalScrollAnimation();
        var currentHeight = getReviewModalCurrentHeight();
        backdrop.classList.remove("is-dragging");
        var collapsedHeight = reviewModalCollapsedHeight || currentHeight;
        if (currentHeight < collapsedHeight * 0.72) {
          closeModal();
          return;
        }
        var snapHeights = getReviewModalSnapHeights();
        var nearestHeight = snapHeights.reduce(function (nearest, height) {
          return Math.abs(height - currentHeight) < Math.abs(nearest - currentHeight) ? height : nearest;
        }, snapHeights[0]);
        snapReviewModalToHeight(nearestHeight);
      }

      function canNestedReviewSurfaceScrollUp(target) {
        var element = target instanceof Element ? target : null;
        while (element && element !== reviewModal) {
          var styles = window.getComputedStyle(element);
          var isScrollable = /(auto|scroll)/.test(styles.overflowY)
            && element.scrollHeight > element.clientHeight + 1;
          if (isScrollable && element.scrollTop > 1) return true;
          element = element.parentElement;
        }
        return reviewModal.scrollTop > 1;
      }

      function resizeReviewModalBeforeScroll(delta, target) {
        if (!backdrop || !reviewModal || !backdrop.classList.contains("open") || !isMobileReviewsLayout()) return false;
        if (!delta) return false;
        var currentHeight = getReviewModalCurrentHeight();
        var viewportHeight = getReviewModalViewportHeight();
        if (!currentHeight || !viewportHeight) return false;
        var shrinkingFromTop = delta < 0 && !canNestedReviewSurfaceScrollUp(target);
        var growingBeforeContent = delta > 0 && currentHeight < viewportHeight - 2;
        if (!shrinkingFromTop && !growingBeforeContent) return false;
        var normalizedDelta = Math.max(-96, Math.min(96, delta)) * 0.9;
        var baseHeight = reviewModalScrollTargetHeight || currentHeight;
        queueReviewModalInteractiveHeight(baseHeight + normalizedDelta);
        window.clearTimeout(reviewModalScrollGrowTimer);
        reviewModalScrollGrowTimer = window.setTimeout(settleReviewModalAfterInteraction, 150);
        return true;
      }
      if (reviewModal) {
        reviewModal.addEventListener("wheel", function (event) {
          if (!isMobileReviewsLayout()) return;
          var viewportHeight = getReviewModalViewportHeight();
          var delta = event.deltaMode === 1
            ? event.deltaY * 18
            : event.deltaMode === 2
              ? event.deltaY * viewportHeight
              : event.deltaY;
          if (resizeReviewModalBeforeScroll(delta, event.target)) {
            event.preventDefault();
          }
        }, { passive: false, signal: reviewsPageSignal });
        reviewModal.addEventListener("touchstart", function (event) {
          if (!isMobileReviewsLayout() || !event.touches.length) return;
          reviewModalScrollTouchY = event.touches[0].clientY;
        }, { passive: true, signal: reviewsPageSignal });
        reviewModal.addEventListener("touchmove", function (event) {
          if (!isMobileReviewsLayout() || !event.touches.length) return;
          var nextY = event.touches[0].clientY;
          var delta = reviewModalScrollTouchY - nextY;
          reviewModalScrollTouchY = nextY;
          if (resizeReviewModalBeforeScroll(delta, event.target)) {
            event.preventDefault();
          }
        }, { passive: false, signal: reviewsPageSignal });
        reviewModal.addEventListener("touchend", settleReviewModalAfterInteraction, { passive: true, signal: reviewsPageSignal });
        reviewModal.addEventListener("touchcancel", settleReviewModalAfterInteraction, { passive: true, signal: reviewsPageSignal });
      }
      var openModalBtn = document.getElementById("openModalBtn");
      var openModalBtn2 = document.getElementById("openModalBtn2");
      var openModalBtnMobile = document.getElementById("openModalBtnMobile");
      if (openModalBtn) openModalBtn.addEventListener("click", openModal, { signal: reviewsPageSignal });
      if (openModalBtn2) openModalBtn2.addEventListener("click", openModal, { signal: reviewsPageSignal });
      if (openModalBtnMobile) openModalBtnMobile.addEventListener("click", openModal, { signal: reviewsPageSignal });
      document.getElementById("closeModalBtn").addEventListener("click", closeModal, { signal: reviewsPageSignal });
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) closeModal();
      }, { signal: reviewsPageSignal });
      if (reviewModalHandle) {
        var modalDragStartY = 0;
        var modalDragStartHeight = 0;
        var modalDragLastHeight = 0;
        var modalDragActive = false;
        reviewModalHandle.addEventListener("pointerdown", function (event) {
          if (!isMobileReviewsLayout()) return;
          event.preventDefault();
          modalDragStartY = event.clientY;
          modalDragStartHeight = reviewModal?.getBoundingClientRect().height || 0;
          modalDragLastHeight = modalDragStartHeight;
          modalDragActive = true;
          window.clearTimeout(reviewModalHeightTimer);
          stopReviewModalScrollAnimation();
          reviewModalHandle.dataset.dragged = "false";
          backdrop.classList.add("is-dragging");
          if (reviewModal) {
            reviewModal.style.height = modalDragStartHeight + "px";
            reviewModal.style.maxHeight = "100dvh";
          }
          reviewModalHandle.setPointerCapture(event.pointerId);
        }, { signal: reviewsPageSignal });
        reviewModalHandle.addEventListener("pointermove", function (event) {
          if (!modalDragActive) return;
          event.preventDefault();
          var deltaY = event.clientY - modalDragStartY;
          var viewportHeight = getReviewModalViewportHeight();
          var maxHeight = viewportHeight;
          modalDragLastHeight = Math.max(80, Math.min(maxHeight, modalDragStartHeight - deltaY));
          applyReviewModalInteractiveHeight(modalDragLastHeight);
        }, { signal: reviewsPageSignal });
        reviewModalHandle.addEventListener("pointerup", function (event) {
          if (!modalDragActive) return;
          modalDragActive = false;
          backdrop.classList.remove("is-dragging");
          if (Math.abs(modalDragLastHeight - modalDragStartHeight) > 10) {
            reviewModalHandle.dataset.dragged = "true";
            window.setTimeout(function () {
              reviewModalHandle.dataset.dragged = "false";
            }, 220);
          }
          settleReviewModalAfterInteraction();
          if (reviewModalHandle.hasPointerCapture(event.pointerId)) {
            reviewModalHandle.releasePointerCapture(event.pointerId);
          }
        }, { signal: reviewsPageSignal });
        reviewModalHandle.addEventListener("pointercancel", function (event) {
          modalDragActive = false;
          backdrop.classList.remove("is-dragging");
          settleReviewModalAfterInteraction();
          if (reviewModalHandle.hasPointerCapture(event.pointerId)) {
            reviewModalHandle.releasePointerCapture(event.pointerId);
          }
        }, { signal: reviewsPageSignal });
      }
      function syncReviewModalToViewport() {
        if (!reviewModal || !backdrop.classList.contains("open") || !isMobileReviewsLayout()) return;
        var viewportHeight = getReviewModalViewportHeight();
        var currentHeight = getReviewModalCurrentHeight();
        if (backdrop.classList.contains("is-expanded") || currentHeight > viewportHeight) {
          applyReviewModalInteractiveHeight(viewportHeight);
        }
      }
      window.addEventListener("resize", syncReviewModalToViewport, { signal: reviewsPageSignal });
      window.visualViewport?.addEventListener("resize", syncReviewModalToViewport, { signal: reviewsPageSignal });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          closeModal();
          return;
        }
        if (e.key !== "Tab" || !backdrop.classList.contains("open") || !reviewModal) return;
        var focusable = Array.from(reviewModal.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(function (element) {
          return !element.hidden && element.offsetParent !== null;
        });
        if (!focusable.length) {
          e.preventDefault();
          reviewModalHandle?.focus({ preventScroll: true });
          return;
        }
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }, { signal: reviewsPageSignal });

      var selectedStars = 0;
      var starEls = document.querySelectorAll("#starsPicker svg");
      starEls.forEach(function (s, i) {
        s.addEventListener("mouseenter", function () {
          highlight(i + 1);
        });
        s.addEventListener("mouseleave", function () {
          highlight(selectedStars);
        });
        s.addEventListener("click", function () {
          selectedStars = i + 1;
          highlight(selectedStars);
          validateReviewForm();
        });
      });
      function highlight(n) {
        starEls.forEach(function (s, i) {
          s.classList.toggle("is-active", i < n);
        });
      }

      var selectedReviewProduct = null;
      var reviewSubmitButtonIcon = "";
      var reviewSubmitButtonLabel = "";

      function setReviewSubmitLabel(label) {
        var button = document.getElementById("submitReviewBtn");
        if (!button) return;
        if (reviewSubmitButtonLabel === label) return;
        if (!reviewSubmitButtonIcon) {
          var icon = button.querySelector("svg");
          reviewSubmitButtonIcon = icon ? icon.outerHTML : "";
        }
        var previousLabel = reviewSubmitButtonLabel || label;
        if (!reviewSubmitButtonLabel) {
          reviewSubmitButtonLabel = label;
          button.innerHTML = reviewSubmitButtonIcon + '<span class="review-form__submit-label"><span class="review-form__submit-label-current">' + escapeHtml(label) + "</span></span>";
          return;
        }
        reviewSubmitButtonLabel = label;
        button.classList.remove("is-label-changing");
        button.innerHTML =
          reviewSubmitButtonIcon +
          '<span class="review-form__submit-label">' +
            '<span class="review-form__submit-label-current">' + escapeHtml(previousLabel) + "</span>" +
            '<span class="review-form__submit-label-next">' + escapeHtml(label) + "</span>" +
          "</span>";
        void button.offsetWidth;
        button.classList.add("is-label-changing");
        window.setTimeout(function () {
          if (reviewSubmitButtonLabel !== label) return;
          button.classList.remove("is-label-changing");
          button.innerHTML = reviewSubmitButtonIcon + '<span class="review-form__submit-label"><span class="review-form__submit-label-current">' + escapeHtml(label) + "</span></span>";
        }, 380);
      }

      function validateReviewForm() {
        var button = document.getElementById("submitReviewBtn");
        var text = document.getElementById("formText").value.trim();
        if (!button) return false;
        if (!selectedStars) {
          button.disabled = true;
          setReviewSubmitLabel("Выберите оценку");
          return false;
        }
        if (!selectedReviewProduct) {
          button.disabled = true;
          setReviewSubmitLabel("Выберите товар");
          return false;
        }
        if (!text) {
          button.disabled = true;
          setReviewSubmitLabel("Напишите комментарий");
          return false;
        }
        button.disabled = false;
        setReviewSubmitLabel("Опубликовать");
        return true;
      }

      function getPopularReviewProducts() {
        return PRODUCTS_DATA.slice()
          .sort(function (a, b) {
            return (Number(b.review_count || 0) - Number(a.review_count || 0)) || (Number(b.likes || 0) - Number(a.likes || 0)) || (Number(a.id) - Number(b.id));
          })
          .slice(0, 3);
      }

      function getProductSearchText(product) {
        return [
          product.id,
          product.code,
          product.name,
          product.brand,
          product.brand_name,
        ].filter(Boolean).join(" ").toLowerCase();
      }

      function searchReviewProducts(query) {
        var value = query.trim().toLowerCase();
        if (!value) return getPopularReviewProducts();
        return PRODUCTS_DATA.filter(function (product) {
          return getProductSearchText(product).indexOf(value) !== -1;
        }).slice(0, 8);
      }

      function setSelectedReviewProduct(product) {
        selectedReviewProduct = product || null;
        var input = document.getElementById("formProduct");
        var hidden = document.getElementById("formProductId");
        if (input && product) input.value = product.name;
        if (hidden) hidden.value = product ? product.id : "";
        validateReviewForm();
      }

      function findSelectedProduct() {
        return selectedReviewProduct;
      }

      var reviewProductMenuTimer = 0;
      var reviewProductExpandTimer = 0;

      function closeReviewProductMenu() {
        window.clearTimeout(reviewProductMenuTimer);
        window.clearTimeout(reviewProductExpandTimer);
        var menu = document.getElementById("reviewProductMenu");
        var modal = document.querySelector("#modalBackdrop .modal");
        var isActive = Boolean(
          (menu && menu.classList.contains("is-open")) ||
          (modal && (
            modal.classList.contains("is-product-clearing") ||
            modal.classList.contains("is-product-expanding") ||
            modal.classList.contains("is-product-picking")
          ))
        );
        if (!isActive) return;
        if (modal) {
          var currentHeight = modal.getBoundingClientRect().height;
          modal.style.height = currentHeight + "px";
          modal.style.minHeight = "0px";
          modal.offsetHeight;
          if (menu) menu.classList.remove("is-open");
          modal.classList.remove("is-product-clearing", "is-product-expanding", "is-product-picking");
          window.requestAnimationFrame(function () {
            var targetHeight = modal.scrollHeight;
            modal.style.height = targetHeight + "px";
          });
          reviewProductMenuTimer = window.setTimeout(function () {
            modal.style.removeProperty("height");
            modal.style.removeProperty("min-height");
          }, 620);
        } else if (menu) {
          menu.classList.remove("is-open");
        }
      }

      function openReviewProductMenu(query) {
        var modal = document.querySelector("#modalBackdrop .modal");
        var menu = document.getElementById("reviewProductMenu");
        var isAlreadyPicking = modal && (
          modal.classList.contains("is-product-picking") ||
          modal.classList.contains("is-product-expanding") ||
          modal.classList.contains("is-product-clearing")
        );
        if (isAlreadyPicking) {
          renderReviewProductMenu(query || "", modal.classList.contains("is-product-picking"));
          return;
        }
        window.clearTimeout(reviewProductMenuTimer);
        window.clearTimeout(reviewProductExpandTimer);
        if (menu) menu.classList.remove("is-open");
        if (modal) {
          modal.style.minHeight = modal.getBoundingClientRect().height + "px";
          modal.classList.add("is-product-clearing");
          modal.classList.remove("is-product-expanding", "is-product-picking");
        }
        renderReviewProductMenu(query || "", false);
        reviewProductExpandTimer = window.setTimeout(function () {
          if (!modal || !modal.classList.contains("is-product-clearing")) return;
          modal.classList.remove("is-product-clearing");
          modal.classList.add("is-product-expanding");
        }, 260);
        reviewProductMenuTimer = window.setTimeout(function () {
          var currentMenu = document.getElementById("reviewProductMenu");
          if (currentMenu && modal && modal.classList.contains("is-product-expanding")) {
            modal.classList.remove("is-product-expanding");
            modal.classList.add("is-product-picking");
            currentMenu.classList.add("is-open");
          }
        }, 620);
      }

      function renderReviewProductMenu(query, shouldOpen) {
        var menu = document.getElementById("reviewProductMenu");
        if (!menu) return;
        var products = searchReviewProducts(query || "");
        var openAfterRender = shouldOpen !== false;
        if (!products.length) {
          menu.innerHTML = '<div class="review-form__product-head">Результат поиска</div>' +
            '<div class="review-form__product-empty">Товар не найден</div>';
          if (openAfterRender) menu.classList.add("is-open");
          return;
        }
        menu.innerHTML = '<div class="review-form__product-head">' + (query ? "Найденные товары" : "Популярные товары") + '</div>' +
          products.map(function (product, index) {
          var meta = [product.brand || product.brand_name, product.review_count ? product.review_count + " отзывов" : ""].filter(Boolean).join(" · ");
          var isSelected = selectedReviewProduct && Number(selectedReviewProduct.id) === Number(product.id);
          return '<button class="review-form__product-option" type="button" data-review-product-id="' + product.id + '">' +
            '<span class="review-form__product-index">' + String(index + 1).padStart(2, "0") + '</span>' +
            '<span class="review-form__product-main">' +
              '<span class="review-form__product-name">' + escapeHtml(product.name) + '</span>' +
              '<span class="review-form__product-meta">' + escapeHtml(meta || "Товар из каталога") + '</span>' +
            '</span>' +
            '<span class="review-form__product-check" aria-hidden="true">' + (isSelected ? "✓" : "") + '</span>' +
          '</button>';
        }).join("");
        if (openAfterRender) menu.classList.add("is-open");
      }

      function setupProductSearch() {
        var input = document.getElementById("formProduct");
        if (!input) return;
        input.removeAttribute("list");
        input.setAttribute("autocomplete", "off");
        var field = input.closest(".field");
        if (field) field.classList.add("review-form__product");

        var hidden = document.getElementById("formProductId");
        if (!hidden) {
          hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.id = "formProductId";
          input.insertAdjacentElement("beforebegin", hidden);
        }

        var menu = document.getElementById("reviewProductMenu");
        if (!menu) {
          menu = document.createElement("div");
          menu.id = "reviewProductMenu";
          menu.className = "review-form__product-menu";
          input.insertAdjacentElement("afterend", menu);
        }

        input.addEventListener("focus", function () {
          openReviewProductMenu(input.value);
        });
        input.addEventListener("input", function () {
          setSelectedReviewProduct(null);
          openReviewProductMenu(input.value);
        });
        menu.addEventListener("click", function (event) {
          var option = event.target.closest("[data-review-product-id]");
          if (!option) return;
          var productId = Number(option.getAttribute("data-review-product-id"));
          var product = PRODUCTS_DATA.find(function (item) {
            return Number(item.id) === productId;
          });
          setSelectedReviewProduct(product);
          closeReviewProductMenu();
        });
        document.addEventListener("click", function (event) {
          if (!event.target.closest(".review-form__product")) closeReviewProductMenu();
        }, { signal: reviewsPageSignal });
        input.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            closeReviewProductMenu();
            input.blur();
          }
        });
      }

      document.getElementById("submitReviewBtn").addEventListener("click", async function () {
        if (!validateReviewForm()) return;
        var name = document.getElementById("formName").value.trim();
        var text = document.getElementById("formText").value.trim();
        var product = findSelectedProduct();
        if (!text || !selectedStars) {
          alert("Пожалуйста, укажите оценку и текст.");
          return;
        }
        if (!product) {
          alert("Товар не найден");
          return;
        }

        var response = await fetch("/api/reviews/create/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            product_id: product.id,
            author_name: name || "Аноним",
            rating: selectedStars,
            text: text,
          }),
        });
        var data = await response.json().catch(function () {
          return {};
        });
        if (!response.ok) {
          alert(data.error || "Не удалось отправить отзыв");
          return;
        }

        REVIEWS_DATA.unshift(data.review);
        filteredData = REVIEWS_DATA.slice();
        activeFilter = "all";
        activeRating = 0;
        verifiedOnly = false;
        syncReviewFilterControls();
        currentPage = 1;
        updateReviewSummary();
        showPage();
        closeModal();
        ["formName", "formText", "formProduct"].forEach(function (id) {
          document.getElementById(id).value = "";
        });
        selectedStars = 0;
        selectedReviewProduct = null;
        var productIdInput = document.getElementById("formProductId");
        if (productIdInput) productIdInput.value = "";
        highlight(0);
        validateReviewForm();
      });


      function initReviewsPage() {
        setupProductSearch();
        setupMobileRatingModule();
        setupReviewFilters();
        setupReviewsFilterScroll();
        document.getElementById("formText")?.addEventListener("input", validateReviewForm);
        updateReviewSummary();
        syncReviewsSidebarGeometry();
        updateReviewsSidebarPosition();
        validateReviewForm();
        syncReviewFilterControls();
        showPage.shouldScroll = false;
        showPage();
      }

      if (document.readyState === "loading") {
        window.addEventListener("load", initReviewsPage, { once: true, signal: reviewsPageSignal });
      } else {
        initReviewsPage();
      }
