// ===== PRELOADER =====
      (function () {
        const introStorageKey = "wave:home-intro-shown";
        let hasShownIntro = window.__waveHomeIntroShown === true;
        try {
          hasShownIntro = hasShownIntro || window.sessionStorage.getItem(introStorageKey) === "1";
        } catch (error) {
          // Keep the flag in memory when session storage is unavailable.
        }

        window.__waveHomeIntroShown = true;
        try {
          window.sessionStorage.setItem(introStorageKey, "1");
        } catch (error) {
          // The window flag still covers seamless navigation in this document.
        }

        const preloader = document.querySelector("[data-page-preloader]");
        if (!preloader) return;
        if (hasShownIntro) {
          preloader.remove();
          return;
        }

        const mainBanner = document.getElementById("mainBanner");
        const startedAt = performance.now();
        const minimumVisibleTime = 850;
        const completionDuration = 260;
        const fallbackTimeout = 6000;
        let pageReady = document.readyState === "complete";
        let bannerReady = !mainBanner || mainBanner.classList.contains("is-ready");
        let isHidden = false;

        function hidePreloader(force = false) {
          if (isHidden || (!force && (!pageReady || !bannerReady))) return;
          isHidden = true;
          const remainingTime = Math.max(0, minimumVisibleTime - (performance.now() - startedAt));
          window.setTimeout(() => {
            preloader.classList.add("is-completing");
            window.setTimeout(() => {
              preloader.classList.add("hidden");
              preloader.setAttribute("aria-hidden", "true");
              window.setTimeout(() => {
                preloader.style.display = "none";
              }, 460);
            }, completionDuration);
          }, remainingTime);
        }

        window.addEventListener("load", () => {
          pageReady = true;
          hidePreloader();
        }, { once: true });

        window.addEventListener("wave:main-banner-ready", () => {
          bannerReady = true;
          hidePreloader();
        }, { once: true });

        hidePreloader();
        window.setTimeout(() => hidePreloader(true), fallbackTimeout);
      })();

      // ===== HOME FAQ =====
      (function () {
        const root = document.querySelector("[data-home-faq]");
        if (!root) return;

        const items = Array.from(root.querySelectorAll(".home-faq__item"));

        function syncItem(item) {
          const isOpen = item.classList.contains("is-open");
          const button = item.querySelector(".home-faq__question");
          const answer = item.querySelector(".home-faq__answer");
          button?.setAttribute("aria-expanded", String(isOpen));
          answer?.setAttribute("aria-hidden", String(!isOpen));
        }

        items.forEach(syncItem);

        root.addEventListener("click", (event) => {
          const button = event.target.closest(".home-faq__question");
          if (!button || !root.contains(button)) return;

          const currentItem = button.closest(".home-faq__item");
          if (!currentItem) return;

          const shouldOpen = !currentItem.classList.contains("is-open");
          items.forEach((item) => {
            item.classList.toggle("is-open", item === currentItem && shouldOpen);
            syncItem(item);
          });
        });
      })();

      // ===== MOUSE ANIMATION =====
      (function () {
        const smallCircle = document.getElementById("smallCircle");
        const largeCircle = document.getElementById("largeCircle");
        const mobileCursorMedia = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 768px)");
        const hideCursor = () => {
          if (smallCircle) smallCircle.style.display = "none";
          if (largeCircle) largeCircle.style.display = "none";
          document.documentElement.classList.add("has-no-site-cursor");
        };
        const shouldDisableCursor = () => mobileCursorMedia.matches || (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
        if (!smallCircle || !largeCircle) return;
        if (shouldDisableCursor()) {
          hideCursor();
          return;
        }
        let mouseX = 0,
          mouseY = 0;
        let smallX = 0,
          smallY = 0,
          largeX = 0,
          largeY = 0;
        const smallFollowSpeed = 0.4;
        const largeFollowSpeed = 0.25;
        let isHovering = false;
        let animationFrameId = null;

        function renderCursor(element, x, y) {
          element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        }

        function startAnimation() {
          if (animationFrameId !== null || document.hidden) return;
          animationFrameId = requestAnimationFrame(animate);
        }

        document.addEventListener("mousemove", (e) => {
          if (shouldDisableCursor()) {
            hideCursor();
            return;
          }
          mouseX = e.clientX;
          mouseY = e.clientY;
          startAnimation();
          const hoveredElement = document.elementFromPoint(e.clientX, e.clientY);
          const isClickable = hoveredElement && (hoveredElement.tagName === "BUTTON" || hoveredElement.tagName === "A" || hoveredElement.classList.contains("clickable") || window.getComputedStyle(hoveredElement).cursor === "pointer");
          if (isClickable && !isHovering) {
            isHovering = true;
            smallCircle.classList.add("is-hovered");
            largeCircle.style.opacity = "0";
          } else if (!isClickable && isHovering) {
            isHovering = false;
            smallCircle.classList.remove("is-hovered");
            largeCircle.style.opacity = "1";
          }
        });

        document.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "touch") hideCursor();
        }, { passive: true });

        document.addEventListener("touchstart", hideCursor, { passive: true, once: true });

        mobileCursorMedia.addEventListener?.("change", () => {
          if (shouldDisableCursor()) hideCursor();
        });

        function animate() {
          animationFrameId = null;
          if (document.hidden) return;
          smallX += (mouseX - smallX) * smallFollowSpeed;
          smallY += (mouseY - smallY) * smallFollowSpeed;
          largeX += (mouseX - largeX) * largeFollowSpeed;
          largeY += (mouseY - largeY) * largeFollowSpeed;
          renderCursor(smallCircle, smallX, smallY);
          renderCursor(largeCircle, largeX, largeY);

          const remainingDistance = Math.max(
            Math.abs(mouseX - smallX),
            Math.abs(mouseY - smallY),
            Math.abs(mouseX - largeX),
            Math.abs(mouseY - largeY),
          );
          if (remainingDistance > 0.1) startAnimation();
        }
        smallX = largeX = window.innerWidth / 2;
        smallY = largeY = window.innerHeight / 2;
        mouseX = window.innerWidth / 2;
        mouseY = window.innerHeight / 2;
        renderCursor(smallCircle, smallX, smallY);
        renderCursor(largeCircle, largeX, largeY);

        document.addEventListener("visibilitychange", () => {
          if (document.hidden && animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
        });
      })();

      // ===== BRAND MARQUEE =====
      (function () {
        const brandLineDataElement = document.getElementById("brand-line-data");
        const config = {
          brands: brandLineDataElement ? JSON.parse(brandLineDataElement.textContent || "[]") : [],
          animationSpeed: 36,
        };
        function initBrandMarquee() {
          const marqueeContainer = document.getElementById("marqueeContainer");
          if (!marqueeContainer || !config.brands.length) return;
          const tracks = marqueeContainer.querySelectorAll(".brand-line__row");
          tracks.forEach((track, trackIndex) => {
            track.replaceChildren();
            config.brands.forEach((brand) => {
              track.appendChild(createBrandElement(brand, trackIndex > 0));
            });
          });
          marqueeContainer.style.animationDuration = `${config.animationSpeed}s`;
        }

        function createBrandElement(brand, isClone = false) {
          const container = document.createElement("div");
          container.className = "brand-line__item";
          container.dataset.brand = brand.name.toLowerCase();
          const img = document.createElement("img");
          img.src = brand.logo;
          img.alt = brand.name;
          img.loading = "lazy";
          img.onerror = function () {
            this.style.opacity = "0.5";
            this.style.filter = "grayscale(1)";
          };
          container.appendChild(img);
          if (isClone) {
            container.tabIndex = -1;
            return container;
          }
          return container;
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", initBrandMarquee);
        } else {
          initBrandMarquee();
        }
      })();

      // ===== HOME REVIEWS DATA =====
      (function () {
        const REVIEWS_LIMIT = 3;
        const REVIEW_SWAP_DELAY = 60000;
        const REVIEW_EXIT_DURATION = 260;
        const REVIEW_ENTER_DURATION = 540;
        const starSvg = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l2.4 7.2H19l-5.7 4.1 2.2 6.9L10 15l-5.5 4.2 2.2-6.9L1 9.2h6.6z" /></svg>';
        const userAvatarSvg = '<svg class="reviews-section__avatar-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.99296258,10.5729355 C12.478244,10.5729355 14.4929626,8.55821687 14.4929626,6.0729355 C14.4929626,3.58765413 12.478244,1.5729355 9.99296258,1.5729355 C7.5076812,1.5729355 5.49296258,3.58765413 5.49296258,6.0729355 C5.49296258,8.55821687 7.5076812,10.5729355 9.99296258,10.5729355 Z M10,0 C13.3137085,0 16,2.6862915 16,6 C16,8.20431134 14.8113051,10.1309881 13.0399615,11.173984 C16.7275333,12.2833441 19.4976819,15.3924771 19.9947005,19.2523727 C20.0418583,19.6186047 19.7690435,19.9519836 19.3853517,19.9969955 C19.0016598,20.0420074 18.6523872,19.7816071 18.6052294,19.4153751 C18.0656064,15.2246108 14.4363723,12.0699838 10.034634,12.0699838 C5.6099956,12.0699838 1.93381693,15.231487 1.39476476,19.4154211 C1.34758036,19.7816499 0.998288773,20.0420271 0.614600177,19.9969899 C0.230911582,19.9519526 -0.0418789616,19.6185555 0.00530544566,19.2523267 C0.500630192,15.4077896 3.28612316,12.3043229 6.97954305,11.1838052 C5.19718955,10.1447285 4,8.21217353 4,6 C4,2.6862915 6.6862915,0 10,0 Z"/></svg>';
        const helpfulHeartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
        let allReviews = [];
        let visibleReviews = [];
        let swapTimer = null;

        function getCookie(name) {
          return document.cookie
            .split(";")
            .map((item) => item.trim())
            .find((item) => item.startsWith(`${name}=`))
            ?.split("=")
            .slice(1)
            .join("=") || "";
        }

        function readReviewsData() {
          const dataEl = document.getElementById("home-reviews-data");
          if (!dataEl) return [];
          try {
            const parsed = JSON.parse(dataEl.textContent || "[]");
            return Array.isArray(parsed) ? parsed.filter((review) => review && review.id) : [];
          } catch (error) {
            return [];
          }
        }

        function getRandomItems(items, limit) {
          const pool = items.slice();
          const result = [];
          while (pool.length && result.length < limit) {
            const index = Math.floor(Math.random() * pool.length);
            result.push(pool.splice(index, 1)[0]);
          }
          return result;
        }

        function renderStars(rating) {
          const count = Math.max(0, Math.min(5, Number(rating) || 0));
          return starSvg.repeat(count);
        }

        function syncReviewTextScrollState(root) {
          const scope = root || document;
          scope.querySelectorAll(".reviews-section__text").forEach((text) => {
            const isScrollable = text.scrollHeight > text.clientHeight + 1;
            text.classList.toggle("is-scrollable", isScrollable);
            if (!isScrollable) text.scrollTop = 0;
          });
        }

        function createReviewCard(review, index) {
          const card = document.createElement("article");
          card.className = "reviews-section__card";
          card.dataset.reviewIndex = String(index);
          card.dataset.reviewId = String(review.id);

          const quote = document.createElement("span");
          quote.className = "reviews-section__quote";
          quote.setAttribute("aria-hidden", "true");
          quote.textContent = "“";

          const header = document.createElement("div");
          header.className = "reviews-section__card-header";

          const avatar = document.createElement("div");
          avatar.className = "reviews-section__avatar";
          avatar.innerHTML = userAvatarSvg;

          const helpfulButton = document.createElement("button");
          helpfulButton.className = `reviews-section__like${review.liked ? " is-liked" : ""}`;
          helpfulButton.type = "button";
          helpfulButton.dataset.reviewHelpfulId = String(review.id);
          helpfulButton.setAttribute("aria-pressed", String(Boolean(review.liked)));
          helpfulButton.setAttribute("aria-label", `Отметить отзыв полезным. Отметок: ${Number(review.helpful || 0)}`);
          helpfulButton.title = `Полезно: ${Number(review.helpful || 0)}`;
          helpfulButton.innerHTML = helpfulHeartSvg;
          avatar.appendChild(helpfulButton);

          const meta = document.createElement("div");
          meta.className = "reviews-section__meta";

          const author = document.createElement("span");
          author.className = "reviews-section__author";
          author.textContent = review.name || "Покупатель";

          const date = document.createElement("span");
          date.className = "reviews-section__date";
          date.textContent = review.date || "";

          const stars = document.createElement("div");
          stars.className = "reviews-section__stars";
          stars.setAttribute("aria-label", `${review.rating || 0} звёзд из 5`);
          stars.innerHTML = renderStars(review.rating);

          const text = document.createElement("p");
          text.className = "reviews-section__text";
          text.textContent = review.text || "";

          const product = document.createElement("div");
          product.className = "reviews-section__product";
          product.textContent = review.product || "";

          meta.append(author, date);
          header.append(avatar, meta, stars);
          card.append(quote, header, text, product);
          return card;
        }

        async function toggleReviewHelpful(button) {
          const reviewId = Number(button.dataset.reviewHelpfulId || 0);
          if (!reviewId || button.disabled) return;
          button.disabled = true;
          try {
            const response = await fetch(`/api/reviews/${reviewId}/vote/`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken"),
                "X-Requested-With": "XMLHttpRequest",
              },
              body: JSON.stringify({ vote: "up" }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) return;

            const review = allReviews.find((item) => Number(item.id) === reviewId);
            if (review) {
              review.helpful = Number(data.helpful || 0);
              review.liked = Boolean(data.liked);
            }
            button.classList.toggle("is-liked", Boolean(data.liked));
            button.setAttribute("aria-pressed", String(Boolean(data.liked)));
            button.setAttribute("aria-label", `Отметить отзыв полезным. Отметок: ${Number(data.helpful || 0)}`);
            button.title = `Полезно: ${Number(data.helpful || 0)}`;
          } finally {
            button.disabled = false;
          }
        }

        function syncReviewDots() {
          const nav = document.getElementById("reviewsSliderNav");
          if (!nav) return;
          const activeDot = nav.querySelector(".reviews-section__nav-dot.is-active");
          const activeIndex = activeDot ? parseInt(activeDot.dataset.dot || "0", 10) : 0;
          const safeActiveIndex = Math.min(Number.isNaN(activeIndex) ? 0 : activeIndex, Math.max(visibleReviews.length - 1, 0));
          nav.replaceChildren();
          visibleReviews.forEach((_, index) => {
            const dot = document.createElement("button");
            dot.className = `reviews-section__nav-dot${index === safeActiveIndex ? " is-active" : ""}`;
            dot.dataset.dot = String(index);
            dot.type = "button";
            dot.setAttribute("aria-label", `Перейти к отзыву ${index + 1}`);
            nav.appendChild(dot);
          });
          nav.setAttribute("aria-hidden", visibleReviews.length <= 1 ? "true" : "false");
        }

        function renderReviews() {
          const section = document.getElementById("reviewsSection");
          const track = document.getElementById("reviewsTrack");
          if (!section || !track) return;
          if (!visibleReviews.length) {
            section.hidden = true;
            return;
          }
          section.hidden = false;
          track.replaceChildren();
          visibleReviews.forEach((review, index) => {
            track.appendChild(createReviewCard(review, index));
          });
          syncReviewDots();
          requestAnimationFrame(() => syncReviewTextScrollState(track));
        }

        function replaceRandomReview() {
          if (document.hidden) return;
          const track = document.getElementById("reviewsTrack");
          if (!track || visibleReviews.length < 1 || allReviews.length <= visibleReviews.length) return;

          const activeIds = new Set(visibleReviews.map((review) => review.id));
          const candidates = allReviews.filter((review) => !activeIds.has(review.id));
          if (!candidates.length) return;

          const visibleIndex = Math.floor(Math.random() * visibleReviews.length);
          const nextReview = candidates[Math.floor(Math.random() * candidates.length)];
          const oldCard = track.children[visibleIndex];
          if (!oldCard) return;

          const enterOffset = visibleIndex % 2 === 0 ? "22px" : "-22px";
          const exitOffset = visibleIndex % 2 === 0 ? "-16px" : "16px";
          oldCard.style.setProperty("--review-swap-x", exitOffset);
          oldCard.classList.add("is-review-leaving");
          oldCard.setAttribute("aria-hidden", "true");
          track.setAttribute("aria-busy", "true");
          window.setTimeout(() => {
            visibleReviews[visibleIndex] = nextReview;
            const nextCard = createReviewCard(nextReview, visibleIndex);
            nextCard.style.setProperty("--review-swap-x", enterOffset);
            nextCard.classList.add("is-review-entering");
            oldCard.replaceWith(nextCard);
            syncReviewDots();
            requestAnimationFrame(() => {
              syncReviewTextScrollState(nextCard);
              requestAnimationFrame(() => nextCard.classList.add("is-review-visible"));
            });
            window.setTimeout(() => {
              nextCard.classList.add("has-swapped");
              nextCard.classList.remove("is-review-entering", "is-review-visible");
              nextCard.style.removeProperty("--review-swap-x");
              track.removeAttribute("aria-busy");
            }, REVIEW_ENTER_DURATION);
          }, REVIEW_EXIT_DURATION);
        }

        function stopReviewRotation() {
          if (!swapTimer) return;
          window.clearInterval(swapTimer);
          swapTimer = null;
        }

        function startReviewRotation() {
          stopReviewRotation();
          if (!document.hidden && allReviews.length > visibleReviews.length) {
            swapTimer = window.setInterval(replaceRandomReview, REVIEW_SWAP_DELAY);
          }
        }

        function initHomeReviews() {
          allReviews = readReviewsData();
          visibleReviews = getRandomItems(allReviews, Math.min(REVIEWS_LIMIT, allReviews.length));
          renderReviews();
          document.getElementById("reviewsTrack")?.addEventListener("click", (event) => {
            const helpfulButton = event.target.closest("[data-review-helpful-id]");
            if (!helpfulButton) return;
            event.preventDefault();
            event.stopPropagation();
            toggleReviewHelpful(helpfulButton);
          });
          startReviewRotation();
          document.addEventListener("visibilitychange", () => {
            if (document.hidden) stopReviewRotation();
            else startReviewRotation();
          });
          window.addEventListener("resize", () => {
            window.requestAnimationFrame(() => syncReviewTextScrollState(document.getElementById("reviewsTrack")));
          });
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", initHomeReviews);
        } else {
          initHomeReviews();
        }
      })();

      // ===== REVIEWS SLIDER =====
      (function () {
        const SLIDER_BP = 1050;
        const AUTO_DELAY = 5500;
        const ANIM_DURATION = 450;

        let currentIndex = 0;
        let autoTimer = null;
        let isAnimating = false;
        let touchStartX = 0;
        let touchDeltaX = 0;
        let isTouching = false;

        function isSliderMode() {
          return window.innerWidth <= SLIDER_BP;
        }
        function getTrack() {
          return document.getElementById("reviewsTrack");
        }
        function getDots() {
          return document.querySelectorAll(".reviews-section__nav-dot");
        }
        function getCards() {
          return document.querySelectorAll(".reviews-section__card");
        }
        function getTrackGap() {
          const track = getTrack();
          if (!track) return 0;
          const styles = window.getComputedStyle(track);
          const gap = parseFloat(styles.columnGap || styles.gap || "0");
          return Number.isNaN(gap) ? 0 : gap;
        }

        function getCardWidth() {
          const card = getCards()[0];
          if (!card) return 0;
          return card.getBoundingClientRect().width + getTrackGap();
        }

        function goTo(index, skipAnimation) {
          if (!isSliderMode()) return;
          const track = getTrack();
          const cards = getCards();
          if (!track || !cards.length) return;
          const total = cards.length;
          currentIndex = ((index % total) + total) % total;
          const offset = -(currentIndex * getCardWidth());
          if (skipAnimation) {
            track.style.transition = "none";
            track.style.transform = "translateX(" + offset + "px)";
          } else {
            isAnimating = true;
            track.style.transition = "transform " + ANIM_DURATION + "ms cubic-bezier(0.4,0,0.2,1)";
            track.style.transform = "translateX(" + offset + "px)";
            setTimeout(function () {
              isAnimating = false;
            }, ANIM_DURATION);
          }
          getDots().forEach(function (dot, i) {
            dot.classList.toggle("is-active", i === currentIndex);
          });
        }

        function next() {
          goTo(currentIndex + 1);
        }

        function startAuto() {
          stopAuto();
          if (document.hidden || !isSliderMode()) return;
          autoTimer = setInterval(next, AUTO_DELAY);
        }
        function stopAuto() {
          if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
          }
        }

        function resetOnResize() {
          const track = getTrack();
          if (!track) return;
          if (!isSliderMode()) {
            stopAuto();
            track.style.transform = "";
            track.style.transition = "";
          } else {
            goTo(currentIndex, true);
            startAuto();
          }
        }

        function init() {
          const wrapper = document.getElementById("reviewsTrackWrapper");
          const track = getTrack();
          if (!track || !wrapper) return;

          var dotsContainer = document.getElementById("reviewsSliderNav");
          if (dotsContainer) {
            dotsContainer.addEventListener("click", function (e) {
              var dot = e.target.closest(".reviews-section__nav-dot");
              if (!dot) return;
              var idx = parseInt(dot.dataset.dot, 10);
              goTo(idx);
              stopAuto();
              startAuto();
            });
          }

          wrapper.addEventListener(
            "touchstart",
            function (e) {
              if (!isSliderMode()) return;
              touchStartX = e.touches[0].clientX;
              isTouching = true;
              stopAuto();
            },
            { passive: true },
          );

          wrapper.addEventListener(
            "touchmove",
            function (e) {
              if (!isTouching || !isSliderMode()) return;
              touchDeltaX = e.touches[0].clientX - touchStartX;
              var base = -(currentIndex * getCardWidth());
              track.style.transition = "none";
              track.style.transform = "translateX(" + (base + touchDeltaX) + "px)";
            },
            { passive: true },
          );

          wrapper.addEventListener("touchend", function () {
            if (!isTouching || !isSliderMode()) return;
            isTouching = false;
            if (touchDeltaX < -50) next();
            else if (touchDeltaX > 50) goTo(currentIndex - 1);
            else goTo(currentIndex);
            touchDeltaX = 0;
            startAuto();
          });

          if (isSliderMode()) {
            goTo(0, true);
            startAuto();
          }

          var resizeTimer;
          window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resetOnResize, 100);
          });
          document.addEventListener("visibilitychange", function () {
            if (document.hidden) stopAuto();
            else if (isSliderMode()) startAuto();
          });
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", init);
        } else {
          init();
        }
      })();
