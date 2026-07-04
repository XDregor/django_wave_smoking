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

        document.querySelectorAll(".summary-big").forEach(function (el) {
          el.textContent = stats.average.toFixed(1);
        });
        document.querySelectorAll(".summary-sub").forEach(function (el) {
          el.innerHTML = "&middot; " + stats.total + " отзывов";
        });
        document.querySelectorAll('[data-filter="all"] .filter-badge').forEach(function (el) {
          el.textContent = stats.total;
        });
        [5, 4, 3, 2, 1].forEach(function (n) {
          document.querySelectorAll('[data-filter="' + n + '"] .filter-badge').forEach(function (el) {
            el.textContent = stats.counts[n] || 0;
          });
        });
        document.querySelectorAll('[data-filter="verified"] .filter-badge').forEach(function (el) {
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
      }


      function renderReviews(data) {
        var el = document.getElementById("reviewsList");
        if (!data.length) {
          el.innerHTML = '<div class="empty"><img class="empty-illustration" src="/static/site/shared/img/reviews_empty.svg" alt="" loading="lazy" decoding="async"><p class="empty-title">Отзывы не найдены</p><p class="empty-sub">Попробуйте изменить фильтр</p></div>';
          return;
        }
        var tagIcon = '<svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 000 3.5v4.793a1.5 1.5 0 00.44 1.06l6.75 6.75a1.5 1.5 0 002.12 0l4.794-4.794a1.5 1.5 0 000-2.12L7.353.44A1.5 1.5 0 006.293 0H1.5zm2.5 4a1 1 0 110-2 1 1 0 010 2z"/></svg>';
        var checkIcon =
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 19L16 22L21 17" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 22H7C5.89543 22 5 21.1046 5 20V11.1817C5 11.0632 4.96494 10.9474 4.89923 10.8488L3.10077 8.15115C3.03506 8.05259 3 7.93679 3 7.81833V2.6C3 2.26863 3.26863 2 3.6 2H5.4C5.73137 2 6 2.26863 6 2.6V4.4C6 4.73137 6.26863 5 6.6 5H9.4C9.73137 5 10 4.73137 10 4.4V2.6C10 2.26863 10.2686 2 10.6 2H13.4C13.7314 2 14 2.26863 14 2.6V4.4C14 4.73137 14.2686 5 14.6 5H17.4C17.7314 5 18 4.73137 18 4.4V2.6C18 2.26863 18.2686 2 18.6 2H20.4C20.7314 2 21 2.26863 21 2.6V7.81833C21 7.93679 20.9649 8.05259 20.8992 8.15115L19.1008 10.8488C19.0351 10.9474 19 11.0632 19 11.1817V13.5" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        var likeIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 011.92 2.56l-2.33 8A2 2 0 0117.5 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h2.76a2 2 0 001.79-1.11L12 2a3.13 3.13 0 013 3.88z"/></svg>';

        el.innerHTML = data
          .map(function (r, i) {
            var trunc = (r.text || "").length > 220;
            return (
              '<article class="review-card" style="animation-delay:' +
              (window.innerWidth > 860 ? i * 0.15 : 0) +
              's" data-id="' +
              r.id +
              '">' +
              '<div class="rc-top">' +
              '<div class="rc-avatar c1">' +
              escapeHtml(r.avatar) +
              "</div>" +
              '<div class="rc-info">' +
              '<div class="rc-name-row"><span class="rc-name">' +
              escapeHtml(r.name) +
              "</span>" +
              (r.verified ? '<span class="rc-verified" title="Проверенный покупатель">' + checkIcon + "</span>" : "") +
              "</div>" +
              '<div class="rc-meta-row"><span class="rc-date">' +
              escapeHtml(r.date) +
              "</span>" +
              '<span class="rc-product-tag">' +
              tagIcon +
              "&nbsp;" +
              escapeHtml(r.product) +
              "</span>" +
              "</div></div>" +
              '<div class="rc-stars-block">' +
              renderStars(r.rating, 16) +
              "</div>" +
              "</div>" +
              '<p class="rc-text' +
              (trunc ? " truncated" : "") +
              '" id="rt_' +
              r.id +
              '">' +
              escapeHtml(r.text) +
              "</p>" +
              (trunc ? '<button class="rc-read-more" onclick="toggleText(' + r.id + ',this)">Читать полностью &rarr;</button>' : "") +
              '<div class="rc-footer"><div class="rc-helpful"><span class="rc-helpful-label">Полезно?</span><div class="rc-vote-btns">' +
               '<button class="rc-vote' +
               (r.liked ? " liked" : "") +
               '" data_review_helpful_id="' +
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
        btn.classList.toggle("liked", !!data.liked);
        var counter = btn.querySelector("span");
        if (counter) counter.textContent = data.helpful;
      }


      var activeFilter = "all";
      var currentPage = 1;
      var perPage = 20;
      var filteredData = REVIEWS_DATA.slice();

      function updateReviewsSidebarPosition() {
        var header = document.querySelector(".page_header");
        var isHeaderHidden = header && header.classList.contains("page_header_hidden");
        document.documentElement.style.setProperty("--reviews-sidebar-shift", isHeaderHidden ? "-70px" : "0px");
      }

      window.addEventListener("scroll", updateReviewsSidebarPosition, { passive: true });
      window.addEventListener("resize", updateReviewsSidebarPosition);

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
        var start = (currentPage - 1) * perPage;
        var pageData = filteredData.slice(start, start + perPage);
        renderReviews(pageData);
        document.getElementById("shownCount").textContent = filteredData.length;
        renderPagination(filteredData.length);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      document.getElementById("filterBtns").addEventListener("click", function (e) {
        var btn = e.target.closest(".filter-btn");
        if (!btn) return;
        document.querySelectorAll(".filter-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        activeFilter = btn.dataset.filter;
        applyFilter();
      });
      function applyFilter() {
        var data = REVIEWS_DATA.slice();
        if (activeFilter === "verified")
          data = data.filter(function (r) {
            return r.verified;
          });
        else if (!isNaN(activeFilter))
          data = data.filter(function (r) {
            return r.rating === +activeFilter;
          });
        filteredData = data;
        currentPage = 1;
        showPage();
      }

      var backdrop = document.getElementById("modalBackdrop");
      function openModal() {
        backdrop.classList.add("open");
        document.body.style.overflow = "hidden";
      }
      function closeModal() {
        backdrop.classList.remove("open");
        document.body.style.overflow = "";
      }
      var openModalBtn = document.getElementById("openModalBtn");
      var openModalBtn2 = document.getElementById("openModalBtn2");
      if (openModalBtn) openModalBtn.addEventListener("click", openModal);
      if (openModalBtn2) openModalBtn2.addEventListener("click", openModal);
      document.getElementById("closeModalBtn").addEventListener("click", closeModal);
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) closeModal();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeModal();
      });

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
          s.classList.toggle("active", i < n);
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

      function closeReviewProductMenu() {
        var menu = document.getElementById("reviewProductMenu");
        if (menu) menu.classList.remove("is-open");
      }

      function renderReviewProductMenu(query) {
        var menu = document.getElementById("reviewProductMenu");
        if (!menu) return;
        var products = searchReviewProducts(query || "");
        if (!products.length) {
          menu.innerHTML = '<div class="review-form__product-empty">Такого товара на сайте нет</div>';
          menu.classList.add("is-open");
          return;
        }
        menu.innerHTML = products.map(function (product) {
          var meta = [product.brand || product.brand_name, product.review_count ? product.review_count + " отзывов" : ""].filter(Boolean).join(" · ");
          return '<button class="review-form__product-option" type="button" data-review-product-id="' + product.id + '">' +
            '<span class="review-form__product-main">' +
              '<span class="review-form__product-name">' + escapeHtml(product.name) + '</span>' +
              '<span class="review-form__product-meta">' + escapeHtml(meta || "Товар из каталога") + '</span>' +
            '</span>' +
            '<span class="review-form__product-code">#' + escapeHtml(product.code || product.id) + '</span>' +
          '</button>';
        }).join("");
        menu.classList.add("is-open");
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
          renderReviewProductMenu(input.value);
        });
        input.addEventListener("input", function () {
          setSelectedReviewProduct(null);
          renderReviewProductMenu(input.value);
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
        document.querySelectorAll(".filter-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        var allBtn = document.querySelector('[data-filter="all"]');
        if (allBtn) allBtn.classList.add("active");
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


      window.addEventListener("load", function () {
        setupProductSearch();
        document.getElementById("formText")?.addEventListener("input", validateReviewForm);
        updateReviewSummary();
        updateReviewsSidebarPosition();
        validateReviewForm();
        showPage();
      });
