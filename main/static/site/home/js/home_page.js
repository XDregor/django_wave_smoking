// ===== PRELOADER =====
      (function () {
        const preloader = document.getElementById("page_preloader");
        if (!preloader) return;
        window.addEventListener("load", function () {
          setTimeout(() => {
            preloader.classList.add("hidden");
            setTimeout(() => {
              preloader.style.display = "none";
            }, 500);
          }, 500);
        });
        if (document.readyState === "complete") {
          setTimeout(() => {
            preloader.classList.add("hidden");
            setTimeout(() => {
              preloader.style.display = "none";
            }, 500);
          }, 300);
        }
      })();

      // ===== MOUSE ANIMATION =====
      (function () {
        const smallCircle = document.getElementById("smallCircle");
        const largeCircle = document.getElementById("largeCircle");
        let mouseX = 0,
          mouseY = 0;
        let smallX = 0,
          smallY = 0,
          largeX = 0,
          largeY = 0;
        const smallFollowSpeed = 0.4;
        const largeFollowSpeed = 0.25;
        let isHovering = false;

        document.addEventListener("mousemove", (e) => {
          mouseX = e.clientX;
          mouseY = e.clientY;
          const hoveredElement = document.elementFromPoint(e.clientX, e.clientY);
          const isClickable = hoveredElement && (hoveredElement.tagName === "BUTTON" || hoveredElement.tagName === "A" || hoveredElement.classList.contains("clickable") || window.getComputedStyle(hoveredElement).cursor === "pointer");
          if (isClickable && !isHovering) {
            isHovering = true;
            smallCircle.classList.add("cursor_dot_hover");
            largeCircle.style.opacity = "0";
          } else if (!isClickable && isHovering) {
            isHovering = false;
            smallCircle.classList.remove("cursor_dot_hover");
            largeCircle.style.opacity = "1";
          }
        });

        function animate() {
          smallX += (mouseX - smallX) * smallFollowSpeed;
          smallY += (mouseY - smallY) * smallFollowSpeed;
          largeX += (mouseX - largeX) * largeFollowSpeed;
          largeY += (mouseY - largeY) * largeFollowSpeed;
          smallCircle.style.left = smallX + "px";
          smallCircle.style.top = smallY + "px";
          largeCircle.style.left = largeX + "px";
          largeCircle.style.top = largeY + "px";
          requestAnimationFrame(animate);
        }
        smallX = largeX = window.innerWidth / 2;
        smallY = largeY = window.innerHeight / 2;
        mouseX = window.innerWidth / 2;
        mouseY = window.innerHeight / 2;
        animate();
      })();

      // ===== HERO BANNER =====
      (function () {
        if (window.__waveMainBannerV2) return;
        const cardTexts = {
          0: { badge: "Новая линейка 2026", title: 'Пар <span class="banner_title_accent">без</span><br>компромиссов', subtitle: '<span class="italic">Под-системы, жидкости и аксессуары</span> для тех, кто ценит вкус, надёжность и быстрый выбор без лишнего шума.' },
          1: { badge: "Pod-системы", title: 'Компактный <span class="banner_title_accent">формат</span><br>на каждый день', subtitle: '<span class="italic">Лёгкие устройства с яркой вкусопередачей</span> для повседневного использования, дороги и коротких пауз.' },
          2: { badge: "Жидкости и вкусы", title: 'Вкус,<br><span class="banner_title_accent">который</span> запоминается', subtitle: '<span class="italic">Солевые и органические жидкости</span> с фруктовыми, десертными и классическими табачными профилями.' },
          3: { badge: "Аксессуары", title: 'Все для<br><span class="banner_title_accent">стабильной</span> тяги', subtitle: '<span class="italic">Картриджи, испарители, зарядки и расходники</span>, чтобы устройство всегда было готово к использованию.' },
        };
        const mobileBannerText = {
          badge: "WAVE vape shop",
          title: 'Выбирай <span class="banner_title_accent">вкус</span><br>с первого взгляда',
          subtitle: '<span class="italic">Устройства, жидкости и расходники</span> в одном месте, чтобы нужное находилось быстро и без лишних сомнений.',
        };
        const products = [
          { imageUrl: "", name: "POD-система Wave One", price: "от 799₴", badge: "-15%", badgeColor: "#ff4b4c" },
          { imageUrl: "", name: "Солевые жидкости 30 мл", price: "от 299₴", badge: "НОВИНКА", badgeColor: "#BFF747" },
          { imageUrl: "", name: "Бокс-моды и баки", price: "от 2 399₴", badge: "-20%", badgeColor: "#ff4b4c" },
          { imageUrl: "", name: "Картриджи и испарители", price: "от 139₴", badge: "ХИТ", badgeColor: "#BFF747" },
        ];
        const collections = [
          { imageUrl: "", label: "Pod-системы", name: "Быстрый старт", description: "Компактные устройства для солевых жидкостей с простой заправкой и стабильной тягой" },
          { imageUrl: "", label: "Жидкости", name: "Яркие вкусы", description: "Фрукты, холодок, десерты и табак в солевых и классических линейках" },
          { imageUrl: "", label: "Аксессуары", name: "Всегда под рукой", description: "Картриджи, испарители, зарядки и всё, что нужно для ежедневного использования" },
        ];

        let currentProductIndex = 0;
        let autoChangeInterval;
        let isChangingProduct = false;
        let scrollPosition = 0;
        const scrollStep = 412;
        let isDragging = false,
          startX,
          startY,
          scrollStart;
        let lastScrollTime = 0,
          lastActiveCardIndex = -1,
          animationFrameId = null;
        let touchDragAxis = null;
        let cardsTrack, productImage, productName, productPrice, productBadge, navDots, badgeText, heroTitle, heroSubtitle, textContent;
        let cachedMaxScroll = -Infinity;
        let wasMobileBannerLayout = isMobileBannerLayout();
        let isTrackCentered = false;

        function isMobileBannerLayout() {
          return window.matchMedia("(max-width: 700px)").matches;
        }

        function getVisibleCards() {
          return Array.from(document.querySelectorAll(".banner_product_wrapper, .banner_collection_card")).filter((card) => card.offsetParent !== null);
        }

        function getCardContentIndex(card, fallbackIndex = 0) {
          if (!card) return fallbackIndex;
          if (card.classList.contains("banner_product_wrapper")) return 0;
          const collectionIndex = Number.parseInt(card.getAttribute("data-collection-index"), 10);
          return Number.isNaN(collectionIndex) ? fallbackIndex : collectionIndex + 1;
        }

        function getCardStep(cards = getVisibleCards()) {
          if (cards.length < 2) return cards[0]?.offsetWidth || scrollStep;
          const firstRect = cards[0].getBoundingClientRect();
          const secondRect = cards[1].getBoundingClientRect();
          const distance = secondRect.left - firstRect.left;
          return distance > 0 ? distance : cards[0].offsetWidth || scrollStep;
        }

        function getBannerActivationPoint() {
          const rightPanel = document.querySelector(".banner_right_panel");
          const leftPanel = document.querySelector(".banner_left_panel");
          const rightPanelRect = rightPanel?.getBoundingClientRect();
          const leftPanelRect = leftPanel?.getBoundingClientRect();

          if (isMobileBannerLayout()) {
            return (rightPanelRect?.left || 0) + (rightPanelRect?.width || 0) * 0.5;
          }

          if (leftPanelRect) return leftPanelRect.right;
          if (rightPanelRect) return rightPanelRect.left;
          return 0;
        }

        function shouldCenterTrack(cards = getVisibleCards()) {
          const rightPanel = document.querySelector(".banner_right_panel");
          if (!rightPanel || !cards.length) return false;
          const styles = window.getComputedStyle(cardsTrack);
          const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
          const totalCardsWidth = cards.reduce((sum, card) => sum + card.offsetWidth, 0);
          const totalWidth = totalCardsWidth + gap * Math.max(cards.length - 1, 0);
          return totalWidth <= rightPanel.clientWidth;
        }

        function syncTrackLayout() {
          if (!cardsTrack) return [];
          const cards = getVisibleCards();
          isTrackCentered = shouldCenterTrack(cards);
          cardsTrack.classList.toggle("banner_cards_track_centered", isTrackCentered);
          if (isTrackCentered) {
            scrollPosition = 0;
            cardsTrack.style.transform = "translateX(0)";
          }
          return cards;
        }

        function initializeImages() {
          const firstProduct = products[0];
          if (productImage) {
            productImage.addEventListener("load", () => hideLoading("productLoading"), { once: true });
            productImage.addEventListener("error", () => hideLoading("productLoading", { immediate: true }), { once: true });
            if (firstProduct.imageUrl) {
              productImage.src = firstProduct.imageUrl;
              productImage.alt = firstProduct.name;
            } else {
              productImage.removeAttribute("src");
              hideLoading("productLoading", { immediate: true });
            }
          }
          collections.forEach((collection, index) => {
            const img = document.getElementById(`collectionImage${index}`);
            if (img) {
              img.addEventListener("load", () => hideLoading(`collectionLoading${index}`), { once: true });
              img.addEventListener("error", () => hideLoading(`collectionLoading${index}`, { immediate: true }), { once: true });
              if (collection.imageUrl) {
                img.src = collection.imageUrl;
                img.alt = collection.name;
              } else {
                img.removeAttribute("src"); // не ставим src, если нет URL
                hideLoading(`collectionLoading${index}`, { immediate: true });
              }
              const card = document.querySelector(`[data-collection-index="${index}"]`);
              if (card) {
                const labelEl = card.querySelector(".banner_collection_label");
                const nameEl = card.querySelector(".banner_collection_name");
                const descEl = card.querySelector(".banner_collection_desc");
                if (labelEl) labelEl.textContent = collection.label;
                if (nameEl) nameEl.textContent = collection.name;
                if (descEl) descEl.textContent = collection.description;
              }
            }
          });
        }

        function hideLoading(id, { immediate = false } = {}) {
          const el = document.getElementById(id);
          if (!el) return;
          if (immediate) {
            el.style.display = "none";
            return;
          }
          el.style.opacity = "0";
          setTimeout(() => (el.style.display = "none"), 300);
        }

        function applyBannerText(textData, { immediate = false } = {}) {
          if (!textData || !textContent) return;
          if (immediate) {
            if (badgeText) badgeText.textContent = textData.badge;
            if (heroTitle) heroTitle.innerHTML = textData.title;
            if (heroSubtitle) heroSubtitle.innerHTML = textData.subtitle;
            textContent.classList.remove("banner_text_fade_out", "banner_text_fade_in");
            return;
          }
          textContent.classList.add("banner_text_fade_out");
          setTimeout(() => {
            if (badgeText) badgeText.textContent = textData.badge;
            if (heroTitle) heroTitle.innerHTML = textData.title;
            if (heroSubtitle) heroSubtitle.innerHTML = textData.subtitle;
            textContent.classList.remove("banner_text_fade_out");
            textContent.classList.add("banner_text_fade_in");
            setTimeout(() => textContent.classList.remove("banner_text_fade_in"), 300);
          }, 300);
        }

        function updateMobileBannerText({ force = false, immediate = false } = {}) {
          if (!force && lastActiveCardIndex === "mobile") return;
          applyBannerText(mobileBannerText, { immediate });
          lastActiveCardIndex = "mobile";
        }

        function updateTextForCard(cardIndex, { force = false, immediate = false } = {}) {
          if (isMobileBannerLayout()) {
            updateMobileBannerText({ force, immediate });
            return;
          }
          if (!force && cardIndex === lastActiveCardIndex) return;
          const textData = cardTexts[cardIndex];
          if (!textData) return;
          applyBannerText(textData, { immediate });
          lastActiveCardIndex = cardIndex;
        }

        function changeProduct(index) {
          if (isChangingProduct || index === currentProductIndex) return;
          isChangingProduct = true;
          const product = products[index];
          if (productImage) {
            productImage.style.opacity = "0";
            setTimeout(() => {
              if (product.imageUrl) {
                productImage.src = product.imageUrl;
                productImage.alt = product.name;
              } else {
                productImage.removeAttribute("src");
              }
              productImage.style.opacity = "1";
            }, 200);
          }
          if (productName) productName.textContent = product.name;
          if (productPrice) productPrice.textContent = product.price;
          if (productBadge) {
            productBadge.textContent = product.badge;
            productBadge.style.backgroundColor = product.badgeColor;
            productBadge.style.color = product.badgeColor === "#BFF747" ? "#0b0b0c" : "#ffffff";
          }
          if (navDots) navDots.forEach((dot, i) => dot.classList.toggle("active", i === index));
          currentProductIndex = index;
          setTimeout(() => {
            isChangingProduct = false;
          }, 500);
        }

        function startAutoChange() {
          if (autoChangeInterval) clearInterval(autoChangeInterval);
          autoChangeInterval = setInterval(() => {
            const nextIndex = (currentProductIndex + 1) % products.length;
            changeProduct(nextIndex);
          }, 8000);
        }

        function updateActiveCard() {
          if (isMobileBannerLayout()) {
            updateMobileBannerText();
            return;
          }
          const now = Date.now();
          if (now - lastScrollTime < 50) return;
          lastScrollTime = now;
          const cards = getVisibleCards();
          const productCard = cards.find((card) => card.classList.contains("banner_product_wrapper"));
          const step = getCardStep(cards);
          if (productCard && Math.abs(scrollPosition) < step * 0.5) {
            updateTextForCard(0);
            return;
          }
          const activationPoint = getBannerActivationPoint();
          let activeIndex = 0,
            minDistance = Infinity;
          cards.forEach((card, index) => {
            const cardRect = card.getBoundingClientRect();
            const distance = Math.abs(cardRect.left - activationPoint);
            if (distance < minDistance) {
              minDistance = distance;
              activeIndex = index;
            }
          });
          const cardWidth = cards[0]?.offsetWidth || 400;
          const activeCard = cards[activeIndex];
          if (minDistance < cardWidth * 0.6) updateTextForCard(getCardContentIndex(activeCard, activeIndex));
        }

        function handleMouseUp() {
          if (!isDragging) return;
          isDragging = false;
          touchDragAxis = null;
          if (isTrackCentered) {
            scrollPosition = 0;
            if (cardsTrack) cardsTrack.style.transform = "translateX(0)";
            return;
          }
          if (cardsTrack) cardsTrack.style.transition = "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
          const cards = getVisibleCards();
          const totalWidth = getCardStep(cards);
          let nearestIndex = Math.round(Math.abs(scrollPosition) / totalWidth);
          nearestIndex = Math.max(0, Math.min(nearestIndex, cards.length - 1));
          let snapped = -nearestIndex * totalWidth;
          const maxScroll = getMaxScroll();
          snapped = Math.max(snapped, maxScroll);
          scrollPosition = snapped;
          if (cardsTrack) cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
          setTimeout(updateActiveCard, 50);
        }

        function computeMaxScroll() {
          const cards = getVisibleCards();
          if (!cards.length || !cardsTrack) return -Infinity;
          if (isTrackCentered) return 0;
          const rightPanel = document.querySelector(".banner_right_panel");
          const leftPanel = document.querySelector(".banner_left_panel");
          if (!leftPanel && !rightPanel) return -(cards.length - 1) * getCardStep(cards);
          // Temporarily reset transform to measure natural (unscrolled) positions
          const prevTransform = cardsTrack.style.transform;
          const prevTransition = cardsTrack.style.transition;
          cardsTrack.style.transition = "none";
          cardsTrack.style.transform = "translateX(0)";
          cardsTrack.getBoundingClientRect(); // force reflow
          const lastCard = cards[cards.length - 1];
          const lastCardRect = lastCard.getBoundingClientRect();
          // Restore state
          cardsTrack.style.transform = prevTransform;
          cardsTrack.style.transition = prevTransition;
          if (isMobileBannerLayout() && rightPanel) {
            const rightPanelRect = rightPanel.getBoundingClientRect();
            return Math.min(0, rightPanelRect.right - lastCardRect.right - 20);
          }
          const activationPoint = getBannerActivationPoint();
          // Stop when the last card reaches the same line that triggers the text change.
          return Math.min(0, activationPoint - lastCardRect.left);
        }

        function getMaxScroll() {
          return cachedMaxScroll;
        }

        function handleMouseMove(e) {
          if (!isDragging) return;
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(() => {
            const walk = (e.pageX - startX) * 1.5;
            const maxScroll = getMaxScroll();
            let newPosition = scrollStart - walk;
            newPosition = Math.min(0, Math.max(newPosition, maxScroll));
            scrollPosition = newPosition;
            if (cardsTrack) cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
          });
        }

        window.scrollToCollection = function () {
          if (autoChangeInterval) clearInterval(autoChangeInterval);
          const cards = getVisibleCards();
          if (isTrackCentered) {
            scrollPosition = 0;
            if (cardsTrack) {
              cardsTrack.style.transform = "translateX(0)";
              cardsTrack.style.transition = "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
            }
            updateActiveCard();
            startAutoChange();
            return;
          }
          const targetCard = cards.find((card) => card.classList.contains("banner_collection_card")) || cards[0];
          const targetIndex = Math.max(0, cards.indexOf(targetCard));
          scrollPosition = -targetIndex * getCardStep(cards);
          scrollPosition = Math.max(scrollPosition, getMaxScroll());
          if (cardsTrack) {
            cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
            cardsTrack.style.transition = "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
          }
          setTimeout(() => {
            updateActiveCard();
            startAutoChange();
          }, 100);
        };

        window.showSale = function () {
          if (autoChangeInterval) clearInterval(autoChangeInterval);
          changeProduct(2);
          startAutoChange();
        };

        function initHeroBanner() {
          cardsTrack = document.getElementById("cardsTrack");
          productImage = document.getElementById("productImage");
          productName = document.getElementById("productName");
          productPrice = document.getElementById("productPrice");
          productBadge = document.getElementById("productBadge");
          navDots = document.querySelectorAll(".banner_nav_dot");
          badgeText = document.getElementById("badgeText");
          heroTitle = document.getElementById("heroTitle");
          heroSubtitle = document.getElementById("heroSubtitle");
          textContent = document.getElementById("textContent");

          if (navDots) {
            navDots.forEach((dot, index) => {
              dot.addEventListener("click", () => {
                clearInterval(autoChangeInterval);
                changeProduct(index);
                startAutoChange();
              });
            });
          }

          const initialCards = syncTrackLayout();
          const initialProductCard = initialCards.find((card) => card.classList.contains("banner_product_wrapper"));
          const initialTextIndex = initialProductCard ? 0 : getCardContentIndex(initialCards[0], 0);
          updateTextForCard(initialTextIndex, { force: true, immediate: true });

          if (cardsTrack) {
            cardsTrack.addEventListener("mousedown", (e) => {
              if (isTrackCentered) return;
              isDragging = true;
              startX = e.pageX;
              scrollStart = scrollPosition;
              cardsTrack.style.transition = "none";
              e.preventDefault();
            });
            cardsTrack.addEventListener("touchstart", (e) => {
              if (isTrackCentered) return;
              isDragging = true;
              startX = e.touches[0].pageX;
              startY = e.touches[0].pageY;
              scrollStart = scrollPosition;
              touchDragAxis = null;
              cardsTrack.style.transition = "none";
            });
            cardsTrack.addEventListener(
              "touchmove",
              (e) => {
                if (!isDragging) return;
                const deltaX = e.touches[0].pageX - startX;
                const deltaY = e.touches[0].pageY - startY;
                if (!touchDragAxis) {
                  touchDragAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
                }
                if (touchDragAxis === "y") return;
                e.preventDefault();
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                animationFrameId = requestAnimationFrame(() => {
                  const walk = deltaX * 1.5;
                  const maxScroll = getMaxScroll();
                  let newPosition = Math.min(0, Math.max(scrollStart - walk, maxScroll));
                  scrollPosition = newPosition;
                  cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
                });
              },
              { passive: false },
            );
            cardsTrack.addEventListener("wheel", (e) => {
              if (isTrackCentered) return;
              e.preventDefault();
              clearInterval(autoChangeInterval);
              if (animationFrameId) cancelAnimationFrame(animationFrameId);
              animationFrameId = requestAnimationFrame(() => {
                const maxScroll = getMaxScroll();
                scrollPosition = Math.min(0, Math.max(scrollPosition - e.deltaY * 0.3, maxScroll));
                cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
                cardsTrack.style.transition = "transform 0.2s ease";
                updateActiveCard();
              });
            });
          }

          document.querySelectorAll(".banner_collection_card").forEach((card) => {
            card.addEventListener("click", () => {
              clearInterval(autoChangeInterval);
              if (isTrackCentered) {
                updateTextForCard(getCardContentIndex(card));
                startAutoChange();
                return;
              }
              const cards = getVisibleCards();
              const targetIndex = cards.indexOf(card);
              if (targetIndex === -1) return;
              scrollPosition = -targetIndex * getCardStep(cards);
              scrollPosition = Math.max(scrollPosition, getMaxScroll());
              if (cardsTrack) {
                cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
                cardsTrack.style.transition = "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
              }
              setTimeout(() => {
                updateActiveCard();
                startAutoChange();
              }, 100);
            });
          });

          initializeImages();
          setTimeout(() => {
            syncTrackLayout();
            cachedMaxScroll = computeMaxScroll();
            startAutoChange();
            updateActiveCard();
          }, 100);
          window.addEventListener("resize", () => {
            const isMobileNow = isMobileBannerLayout();
            const cards = syncTrackLayout();
            cachedMaxScroll = computeMaxScroll();
            if (isTrackCentered) {
              scrollPosition = 0;
            } else if (isMobileNow !== wasMobileBannerLayout) {
              scrollPosition = isMobileNow ? 0 : Math.max(scrollPosition, cachedMaxScroll);
            } else if (cards.length) {
              const step = getCardStep(cards);
              const nearestIndex = Math.max(0, Math.min(Math.round(Math.abs(scrollPosition) / step), cards.length - 1));
              scrollPosition = -nearestIndex * step;
              scrollPosition = Math.max(scrollPosition, cachedMaxScroll);
            }
            wasMobileBannerLayout = isMobileNow;
            scrollPosition = Math.min(scrollPosition, 0);
            if (cardsTrack) cardsTrack.style.transform = `translateX(${scrollPosition}px)`;
            updateActiveCard();
          });
          window.addEventListener("mouseup", handleMouseUp);
          window.addEventListener("mousemove", handleMouseMove);
          window.addEventListener("touchend", handleMouseUp);
          window.addEventListener("beforeunload", () => {
            if (autoChangeInterval) clearInterval(autoChangeInterval);
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
          });
        }

        document.addEventListener("DOMContentLoaded", initHeroBanner);
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
          const tracks = marqueeContainer.querySelectorAll(".brand_line_row");
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
          container.className = "brand_line_item";
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
        const userAvatarSvg = '<svg class="reviews_avatar_icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.99296258,10.5729355 C12.478244,10.5729355 14.4929626,8.55821687 14.4929626,6.0729355 C14.4929626,3.58765413 12.478244,1.5729355 9.99296258,1.5729355 C7.5076812,1.5729355 5.49296258,3.58765413 5.49296258,6.0729355 C5.49296258,8.55821687 7.5076812,10.5729355 9.99296258,10.5729355 Z M10,0 C13.3137085,0 16,2.6862915 16,6 C16,8.20431134 14.8113051,10.1309881 13.0399615,11.173984 C16.7275333,12.2833441 19.4976819,15.3924771 19.9947005,19.2523727 C20.0418583,19.6186047 19.7690435,19.9519836 19.3853517,19.9969955 C19.0016598,20.0420074 18.6523872,19.7816071 18.6052294,19.4153751 C18.0656064,15.2246108 14.4363723,12.0699838 10.034634,12.0699838 C5.6099956,12.0699838 1.93381693,15.231487 1.39476476,19.4154211 C1.34758036,19.7816499 0.998288773,20.0420271 0.614600177,19.9969899 C0.230911582,19.9519526 -0.0418789616,19.6185555 0.00530544566,19.2523267 C0.500630192,15.4077896 3.28612316,12.3043229 6.97954305,11.1838052 C5.19718955,10.1447285 4,8.21217353 4,6 C4,2.6862915 6.6862915,0 10,0 Z"/></svg>';
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

        function createReviewCard(review, index) {
          const card = document.createElement("article");
          card.className = "reviews_card";
          card.dataset.reviewIndex = String(index);
          card.dataset.reviewId = String(review.id);

          const quote = document.createElement("span");
          quote.className = "reviews_quote_mark";
          quote.setAttribute("aria-hidden", "true");
          quote.textContent = "“";

          const header = document.createElement("div");
          header.className = "reviews_card_header";

          const avatar = document.createElement("div");
          avatar.className = "reviews_avatar";
          avatar.innerHTML = userAvatarSvg;

          const helpfulButton = document.createElement("button");
          helpfulButton.className = `reviews_avatar_like${review.liked ? " is-liked" : ""}`;
          helpfulButton.type = "button";
          helpfulButton.dataset.reviewHelpfulId = String(review.id);
          helpfulButton.setAttribute("aria-pressed", String(Boolean(review.liked)));
          helpfulButton.setAttribute("aria-label", `Отметить отзыв полезным. Отметок: ${Number(review.helpful || 0)}`);
          helpfulButton.title = `Полезно: ${Number(review.helpful || 0)}`;
          helpfulButton.innerHTML = helpfulHeartSvg;
          avatar.appendChild(helpfulButton);

          const meta = document.createElement("div");
          meta.className = "reviews_meta";

          const author = document.createElement("span");
          author.className = "reviews_author";
          author.textContent = review.name || "Покупатель";

          const date = document.createElement("span");
          date.className = "reviews_date";
          date.textContent = review.date || "";

          const stars = document.createElement("div");
          stars.className = "reviews_stars";
          stars.setAttribute("aria-label", `${review.rating || 0} звёзд из 5`);
          stars.innerHTML = renderStars(review.rating);

          const text = document.createElement("p");
          text.className = "reviews_text";
          text.textContent = review.text || "";

          const product = document.createElement("div");
          product.className = "reviews_product_tag";
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
          const activeDot = nav.querySelector(".reviews_slider_nav_dot.is-active");
          const activeIndex = activeDot ? parseInt(activeDot.dataset.dot || "0", 10) : 0;
          const safeActiveIndex = Math.min(Number.isNaN(activeIndex) ? 0 : activeIndex, Math.max(visibleReviews.length - 1, 0));
          nav.replaceChildren();
          visibleReviews.forEach((_, index) => {
            const dot = document.createElement("button");
            dot.className = `reviews_slider_nav_dot${index === safeActiveIndex ? " is-active" : ""}`;
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
        }

        function replaceRandomReview() {
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
          if (swapTimer) clearInterval(swapTimer);
          if (allReviews.length > visibleReviews.length) {
            swapTimer = window.setInterval(replaceRandomReview, REVIEW_SWAP_DELAY);
          }
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
          return document.querySelectorAll(".reviews_slider_nav_dot");
        }
        function getCards() {
          return document.querySelectorAll(".reviews_card");
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
              var dot = e.target.closest(".reviews_slider_nav_dot");
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
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", init);
        } else {
          init();
        }
      })();

      // ===== RECOMMENDATIONS =====
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("recommendationsContent");
        const toggleBestsellers = document.getElementById("toggleBestsellers");
        const toggleNewItems = document.getElementById("toggleNewItems");
        const toggleSlot = document.getElementById("recommendationsToggleSlot");
        const toggleContainer = document.getElementById("recommendationsToggle");
        const introContainer = document.querySelector(".recommendations_intro");
        const titleEl = document.getElementById("recommendationsTitle");
        const subtitleEl = document.getElementById("recommendationsSubtitle");
        if (!root) return;

        function syncRecommendationsToggleLayout() {
          // Layout handled via CSS media query
        }

        function sizeSet(allSizes, activeSize, outSizes = []) {
          return allSizes.map((label) => ({ label, active: label === activeSize, out: outSizes.includes(label) }));
        }
        function createItem(id, config) {
          return { id, liked: false, ...config };
        }

        const bestsellers = [
          createItem("vaporesso-xros-4", { brand: "Vaporesso", visual: "XROS 4", name: "Pod-система Vaporesso XROS 4 Mini", price: "1 290₴", likes: 34, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.28)", sizes: sizeSet(["0.6Ω", "0.8Ω", "1.0Ω"], "0.8Ω", ["1.0Ω"]) }),
          createItem("voopoo-vmate", { brand: "VOOPOO", visual: "VMATE", name: "Pod-система VOOPOO VMATE i2", price: "1 190₴", likes: 28, badge: { label: "Хит", type: "new" }, tone: "rgba(191, 247, 71, 0.22)", sizes: sizeSet(["0.7Ω", "1.2Ω"], "0.7Ω") }),
          createItem("geekvape-hero", { brand: "GeekVape", visual: "Hero Q", name: "Набор GeekVape Aegis Hero Q", price: "1 890₴", likes: 19, badge: { label: "-10%", type: "sale" }, tone: "rgba(191, 247, 71, 0.20)", sizes: sizeSet(["0.4Ω", "0.6Ω", "0.8Ω"], "0.6Ω", ["0.4Ω"]) }),
          createItem("oxva-cart", { brand: "OXVA", visual: "XLIM V3", name: "Картридж OXVA XLIM V3", price: "149₴", likes: 42, tone: "rgba(191, 247, 71, 0.24)", sizes: sizeSet(["0.6Ω", "0.8Ω", "1.2Ω"], "0.8Ω") }),
          createItem("smok-novo", { brand: "SMOK", visual: "Novo", name: "Картридж SMOK Novo 2X Meshed", price: "159₴", oldPrice: "189₴", likes: 18, badge: { label: "-15%", type: "sale" }, tone: "rgba(191, 247, 71, 0.22)", sizes: sizeSet(["0.8Ω", "1.0Ω"], "0.8Ω", ["1.0Ω"]) }),
          createItem("elfliq-watermelon", { brand: "Elfliq", visual: "Watermelon", name: "Жидкость Elfliq Watermelon 30 мл", price: "329₴", likes: 51, tone: "rgba(191, 247, 71, 0.20)", sizes: sizeSet(["20 мг", "30 мг", "50 мг"], "30 мг", ["50 мг"]) }),
          createItem("chaser-tobacco", { brand: "Chaser", visual: "Tobacco", name: "Жидкость Chaser Classic Tobacco 30 мл", price: "299₴", oldPrice: "349₴", likes: 23, badge: { label: "-14%", type: "sale" }, tone: "rgba(191, 247, 71, 0.24)", sizes: sizeSet(["25 мг", "35 мг", "50 мг"], "25 мг") }),
          createItem("lost-mary-blue", { brand: "Lost Mary", visual: "Blue Razz", name: "Жидкость Lost Mary Blue Razz Ice 30 мл", price: "339₴", likes: 37, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.18)", sizes: sizeSet(["20 мг", "30 мг", "50 мг"], "30 мг") }),
          createItem("sony-vtc6", { brand: "Sony", visual: "VTC6", name: "Аккумулятор Sony VTC6 18650", price: "289₴", oldPrice: "330₴", likes: 16, badge: { label: "-12%", type: "sale" }, tone: "rgba(191, 247, 71, 0.22)", sizes: sizeSet(["1 шт", "2 шт"], "1 шт") }),
          createItem("efest-k2", { brand: "Efest", visual: "Slim K2", name: "Зарядное устройство Efest Slim K2", price: "499₴", oldPrice: "579₴", likes: 12, badge: { label: "-13%", type: "sale" }, tone: "rgba(191, 247, 71, 0.24)", sizes: sizeSet(["EU", "USB-C"], "EU") }),
          createItem("cotton-bacon", { brand: "Cotton Bacon", visual: "Prime", name: "Вата Cotton Bacon Prime", price: "199₴", likes: 21, badge: { label: "Хит", type: "new" }, tone: "rgba(191, 247, 71, 0.16)", sizes: sizeSet(["10 г", "20 г"], "10 г") }),
          createItem("coil-kit", { brand: "Coil Lab", visual: "DIY Kit", name: "Набор спиралей и хлопка для намотки", price: "259₴", likes: 14, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.20)", sizes: sizeSet(["MTL", "RDL", "DL"], "MTL") }),
        ];

        const newItems = [
          createItem("vaporesso-xros-4", { brand: "Vaporesso", visual: "XROS 4", name: "Pod-система Vaporesso XROS 4 Mini", price: "1 290₴", likes: 34, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.28)", sizes: sizeSet(["0.6Ω", "0.8Ω", "1.0Ω"], "0.8Ω", ["1.0Ω"]) }),
          createItem("geekvape-hero", { brand: "GeekVape", visual: "Hero Q", name: "Набор GeekVape Aegis Hero Q", price: "1 890₴", likes: 19, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.20)", sizes: sizeSet(["0.4Ω", "0.6Ω", "0.8Ω"], "0.6Ω", ["0.4Ω"]) }),
          createItem("lost-mary-blue", { brand: "Lost Mary", visual: "Blue Razz", name: "Жидкость Lost Mary Blue Razz Ice 30 мл", price: "339₴", likes: 37, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.18)", sizes: sizeSet(["20 мг", "30 мг", "50 мг"], "30 мг") }),
          createItem("coil-kit", { brand: "Coil Lab", visual: "DIY Kit", name: "Набор спиралей и хлопка для намотки", price: "259₴", likes: 14, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.20)", sizes: sizeSet(["MTL", "RDL", "DL"], "MTL") }),
          createItem("vaporesso-xros-pro", { brand: "Vaporesso", visual: "XROS Pro", name: "Pod-система Vaporesso XROS Pro", price: "1 490₴", likes: 9, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.22)", sizes: sizeSet(["0.6Ω", "0.8Ω"], "0.6Ω") }),
          createItem("uwell-caliburn", { brand: "Uwell", visual: "Caliburn G3", name: "Pod-система Uwell Caliburn G3", price: "1 350₴", likes: 11, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.18)", sizes: sizeSet(["0.6Ω", "0.9Ω"], "0.9Ω") }),
          createItem("elfliq-lychee", { brand: "Elfliq", visual: "Lychee Ice", name: "Жидкость Elfliq Lychee Ice 30 мл", price: "329₴", likes: 7, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.16)", sizes: sizeSet(["20 мг", "30 мг", "50 мг"], "20 мг") }),
          createItem("smok-priv-turbo", { brand: "SMOK", visual: "Priv Turbo", name: "Под-мод SMOK Priv Turbo 60W", price: "1 750₴", likes: 6, badge: { label: "Новинка", type: "new" }, tone: "rgba(191, 247, 71, 0.20)", sizes: sizeSet(["0.15Ω", "0.2Ω"], "0.2Ω") }),
        ];

        const tabs = {
          bestsellers: { items: bestsellers, title: "Самые популярные товары", subtitle: "Подборка товаров, которые чаще всего выбирают наши покупатели." },
          new: { items: newItems, title: "Новинки", subtitle: "Свежие поступления — устройства, жидкости и аксессуары, которые только появились в продаже." },
        };

        let activeTab = "bestsellers";
        const itemMap = new Map();
        bestsellers.forEach((i) => itemMap.set(i.id, i));
        newItems.forEach((i) => itemMap.set(i.id, i));

        function renderCard(item) {
          const badgeClass = item.badge ? `recommendations_item_badge_${item.badge.type}` : "";
          const badgeMarkup = item.badge ? `<span class="recommendations_item_badge ${badgeClass}">${item.badge.label}</span>` : "";
          const oldPriceMarkup = item.oldPrice ? `<span class="recommendations_item_old_price">${item.oldPrice}</span>` : "";
          return `<article class="recommendations_item" data-item-id="${item.id}">
            <div class="recommendations_item_media">
              ${badgeMarkup}
              <button class="recommendations_item_like${item.liked ? " recommendations_item_like_active" : ""}" type="button" aria-label="Добавить в избранное" aria-pressed="${item.liked}" data-like-button>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                <span class="recommendations_item_like_count">${item.likes}</span>
              </button>
              <div class="recommendations_item_placeholder">
                <div class="recommendations_item_loading" aria-hidden="true"></div>
              </div>
            </div>
            <div class="recommendations_item_info">
              <h3 class="recommendations_item_name">${item.name}</h3>
              <div class="recommendations_item_price">${item.price}${oldPriceMarkup}</div>
              <div class="recommendations_item_sizes">${item.sizes
                .map((size) => {
                  const cls = ["recommendations_item_size", size.out ? "recommendations_item_size_out" : ""].filter(Boolean).join(" ");
                  return `<button class="${cls}" type="button" data-size="${size.label}">${size.label}</button>`;
                })
                .join("")}</div>
            </div>
          </article>`;
        }

        function switchTab(tab) {
          if (tab === activeTab) return;
          activeTab = tab;

          // Кнопки
          toggleBestsellers.classList.toggle("active", tab === "bestsellers");
          toggleBestsellers.setAttribute("aria-selected", String(tab === "bestsellers"));
          toggleNewItems.classList.toggle("active", tab === "new");
          toggleNewItems.setAttribute("aria-selected", String(tab === "new"));

          // Заголовок и подзаголовок
          titleEl.textContent = tabs[tab].title;
          subtitleEl.textContent = tabs[tab].subtitle;

          // Анимация: fade-out → swap → fade-in
          root.classList.remove("tab_fade_in");
          root.classList.add("tab_fade_out");
          setTimeout(() => {
            root.innerHTML = tabs[tab].items.map(renderCard).join("");
            root.classList.remove("tab_fade_out");
            root.classList.add("tab_fade_in");
          }, 200);
        }

        // Первый рендер
        root.innerHTML = bestsellers.map(renderCard).join("");
        root.classList.add("tab_fade_in");
        syncRecommendationsToggleLayout();

        toggleBestsellers.addEventListener("click", () => switchTab("bestsellers"));
        toggleNewItems.addEventListener("click", () => switchTab("new"));
        window.addEventListener("resize", syncRecommendationsToggleLayout);

        root.addEventListener("click", (event) => {
          const likeButton = event.target.closest("[data-like-button]");
          if (likeButton) {
            event.preventDefault();
            const card = likeButton.closest(".recommendations_item");
            const item = itemMap.get(card?.dataset.itemId);
            if (!card || !item) return;
            item.liked = !item.liked;
            item.likes += item.liked ? 1 : -1;
            likeButton.classList.toggle("recommendations_item_like_active", item.liked);
            likeButton.setAttribute("aria-pressed", String(item.liked));
            likeButton.querySelector(".recommendations_item_like_count").textContent = String(item.likes);
            return;
          }
        });
      });
