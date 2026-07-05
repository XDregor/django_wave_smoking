      const skuAdminConfig = window.SKU_ADMIN_CONFIG || {};
      const skuAdminSaveUrl = skuAdminConfig.saveUrl || window.location.pathname;
      const skuAdminProductListUrl = skuAdminConfig.productListUrl || "/admin/main/product/";
      const skuAdminQuickAddUrl = skuAdminConfig.quickAddUrl || "";
      const skuAdminMode = skuAdminConfig.mode || "create";
      const skuEditProduct = skuAdminConfig.editProduct && typeof skuAdminConfig.editProduct === "object"
        ? skuAdminConfig.editProduct
        : null;
      const skuAdminStorageKey = `wave_admin_product_sku_state_v1:${skuAdminMode}:${skuAdminConfig.productId || "new"}`;
      let skuAdminRestoringState = false;
      const skuUploadState = {
        mainImage: null,
        extraImages: [],
        promoVideo: null,
        promoVideoPoster: null,
      };

      function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(";").shift();
        return "";
      }

      function readSkuAdminState() {
        try {
          return JSON.parse(localStorage.getItem(skuAdminStorageKey) || "{}");
        } catch (error) {
          return {};
        }
      }

      function writeSkuAdminState(data) {
        try {
          localStorage.setItem(skuAdminStorageKey, JSON.stringify(data));
        } catch (error) {
          /* localStorage can be unavailable in private contexts. */
        }
      }

      function clearSkuAdminState() {
        try {
          localStorage.removeItem(skuAdminStorageKey);
        } catch (error) {
          /* ignore */
        }
      }

      function normalizeLikesAdjustment(value) {
        return Math.max(-1000000, Math.min(1000000, Math.trunc(Number(value) || 0)));
      }

      function updateProductLikesAdjustmentUi() {
        const input = document.getElementById("productLikesAdjustment");
        const realNode = document.getElementById("productLikesReal");
        const totalNode = document.getElementById("productLikesTotal");
        if (!input || !realNode || !totalNode) return;
        const realLikes = Math.max(0, Math.trunc(Number(skuEditProduct?.likesReal) || 0));
        const adjustment = normalizeLikesAdjustment(input.value);
        input.value = String(adjustment);
        realNode.textContent = String(realLikes);
        totalNode.textContent = String(Math.max(0, realLikes + adjustment));
      }

      function setProductLikesAdjustment(value) {
        const input = document.getElementById("productLikesAdjustment");
        if (!input) return;
        input.value = String(normalizeLikesAdjustment(value));
        updateProductLikesAdjustmentUi();
      }

      function getSkuAdminSavedChars() {
        return Array.from(document.querySelectorAll("#charRows .char-row")).map((row) => {
          const inputs = row.querySelectorAll("input");
          return {
            key: inputs[0]?.value || "",
            value: inputs[1]?.value || "",
          };
        });
      }

      function getSkuAdminSavedGroups() {
        if (!Array.isArray(variantGroups)) return [];
        return variantGroups.map((group) => ({
          id: group.id,
          catalogGroupId: group.catalogGroupId || null,
          name: group.name || "",
          hasImages: Boolean(group.hasImages),
          variants: (group.variants || []).map((variant, variantIndex) => ({
            id: variant.id,
            catalogOptionId: variant.catalogOptionId || null,
            name: variant.name || "",
            filterName: variant.filterName || variant.name || "",
            imageUrl: variant.imageUrl || "",
            imageOrder: Number.isFinite(Number(variant.imageOrder)) ? Number(variant.imageOrder) : variantIndex,
          })),
        }));
      }

      function collectSkuAdminState() {
        return {
          savedAt: Date.now(),
          currentStep,
          unlockedUpTo: unlockedUpTo.val,
          extraOpen: document.getElementById("extraFields")?.style.display !== "none",
          charsOpen: document.getElementById("charBlock")?.style.display !== "none",
          videoOpen: document.getElementById("videoBlock")?.style.display !== "none",
          name: document.getElementById("productName")?.value || "",
          category: document.getElementById("categorySelect")?.value || "",
          brand: document.getElementById("brandSelect")?.value || "",
          status: document.getElementById("statusSelect")?.value || "published",
          likesAdjustment: normalizeLikesAdjustment(document.getElementById("productLikesAdjustment")?.value),
          badgeCodes: Array.from(document.querySelectorAll("#badgeGroup .badge-opt.selected")).map((button) => button.dataset.badge).filter(Boolean),
          descriptionHtml: sanitizeRteHtml(document.getElementById("rteBody")?.innerHTML || ""),
          chars: getSkuAdminSavedChars(),
          groups: getSkuAdminSavedGroups(),
          rootPricing: finalRootPricing(),
          skus: finalSkuRows(),
        };
      }

      let skuAdminSaveTimer = null;

      function scheduleSkuAdminStateSave() {
        if (skuAdminRestoringState) return;
        window.clearTimeout(skuAdminSaveTimer);
        skuAdminSaveTimer = window.setTimeout(() => writeSkuAdminState(collectSkuAdminState()), 250);
      }

      function setCollapsibleState(blockId, triggerId, open) {
        const block = document.getElementById(blockId);
        const trigger = document.getElementById(triggerId);
        if (!block) return;
        block.style.display = open ? "block" : "none";
        trigger?.classList.toggle("open", open);
      }

      function restoreSkuAdminState() {
        const saved = readSkuAdminState();
        if (!saved || !saved.savedAt) return;
        skuAdminRestoringState = true;
        try {
          const name = document.getElementById("productName");
          if (name && typeof saved.name === "string") name.value = saved.name;
          setSelectValue("categorySelect", saved.category);
          setSelectValue("brandSelect", saved.brand);
          setSelectValue("statusSelect", saved.status || "published");
          setProductLikesAdjustment(saved.likesAdjustment ?? skuEditProduct?.likesAdjustment ?? 0);
          document.querySelectorAll("#badgeGroup .badge-opt").forEach((button) => {
            setBadgeSelected(button, Array.isArray(saved.badgeCodes) && saved.badgeCodes.includes(button.dataset.badge));
          });
          const rte = document.getElementById("rteBody");
          if (rte && typeof saved.descriptionHtml === "string") rte.innerHTML = sanitizeRteHtml(saved.descriptionHtml);
          if (Array.isArray(saved.chars)) setEditCharacteristics(saved.chars);
          if (Array.isArray(saved.groups) && window.loadVariantGroups) {
            window.loadVariantGroups(saved.groups);
          }
          if (saved.rootPricing || Array.isArray(saved.skus)) {
            applyEditSkuTreeState({ rootPricing: saved.rootPricing || {}, skus: saved.skus || [] });
            skuTreeBuild();
          }

          setCollapsibleState("extraFields", "extraToggle", Boolean(saved.extraOpen));
          setCollapsibleState("charBlock", "charToggle", Boolean(saved.charsOpen));
          setCollapsibleState("videoBlock", "videoToggle", Boolean(saved.videoOpen));

          const targetStep = Math.min(totalSteps, Math.max(1, Number(saved.currentStep) || 1));
          unlockedUpTo.val = Math.min(totalSteps, Math.max(unlockedUpTo.val, Number(saved.unlockedUpTo) || targetStep));
          for (let step = 1; step <= unlockedUpTo.val; step += 1) unlockPill(step);
          validateStep(1);
          validateStep(2);
          showStep(targetStep);
        } finally {
          skuAdminRestoringState = false;
        }
      }

      // ── QUICK-ADD (category / brand) ───────────────
      let qaTarget = null;
      const qaTranslitMap = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
        к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
        х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
        є: "ye", і: "i", ї: "yi", ґ: "g",
      };

      function toSlug(str) {
        return String(str || "")
          .toLowerCase()
          .trim()
          .replace(/[а-яёєіїґ]/g, (char) => qaTranslitMap[char] || char)
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }

      function openQuickAdd(type) {
        qaTarget = type;
        const titles = { category: "Новая категория", brand: "Новый бренд" };
        const title = document.getElementById("qaTitle");
        const input = document.getElementById("qaNameInput");
        const slug = document.getElementById("qaSlugValue");
        const button = document.getElementById("qaConfirmBtn");
        const backdrop = document.getElementById("qaBackdrop");
        if (!title || !input || !slug || !button || !backdrop) return;
        title.textContent = titles[type] || "Добавить";
        input.value = "";
        slug.textContent = "—";
        button.disabled = true;
        button.textContent = "Добавить";
        backdrop.style.display = "flex";
        setTimeout(() => input.focus(), 50);
      }

      function closeQuickAdd(event) {
        const backdrop = document.getElementById("qaBackdrop");
        if (event && backdrop && event.target !== backdrop) return;
        if (backdrop) backdrop.style.display = "none";
        qaTarget = null;
      }

      function qaUpdateSlug() {
        const name = document.getElementById("qaNameInput")?.value || "";
        const slug = toSlug(name);
        const slugEl = document.getElementById("qaSlugValue");
        const button = document.getElementById("qaConfirmBtn");
        if (slugEl) slugEl.textContent = slug || "—";
        if (button) button.disabled = !slug;
      }

      function qaKeydown(event) {
        if (event.key === "Enter") {
          event.preventDefault();
          qaConfirm();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeQuickAdd();
        }
      }

      function syncCustomSelectOption(select, value, label) {
        if (!select) return;
        let option = Array.from(select.options).find((item) => item.value === String(value));
        if (!option) {
          option = document.createElement("option");
          option.value = String(value);
          option.textContent = label;
          select.appendChild(option);
        }
        select.value = String(value);
        select.dispatchEvent(new Event("change", { bubbles: true }));

        const custom = select.nextElementSibling?.classList.contains("custom-select")
          ? select.nextElementSibling
          : select.parentElement?.querySelector(".custom-select");
        if (!custom) return;

        const menu = custom.querySelector(".custom-select-menu");
        const trigger = custom.querySelector(".custom-select-trigger");
        menu?.querySelectorAll(".custom-select-option").forEach((item) => item.classList.remove("is-selected"));
        if (menu) {
          let item = Array.from(menu.querySelectorAll(".custom-select-option")).find((el) => el.dataset.value === String(value));
          if (!item) {
            item = document.createElement("button");
            item.type = "button";
            item.textContent = label;
            item.dataset.value = String(value);
            item.addEventListener("click", () => {
              select.value = String(value);
              select.dispatchEvent(new Event("change", { bubbles: true }));
              menu.querySelectorAll(".custom-select-option").forEach((el) => el.classList.remove("is-selected"));
              item.classList.add("is-selected");
              if (trigger) trigger.textContent = label;
              custom.classList.remove("open");
              custom.closest(".wizard-card")?.classList.remove("select-open");
            });
            menu.appendChild(item);
          }
          item.className = "custom-select-option is-selected";
        }
        if (trigger) trigger.textContent = label;
      }

      async function qaConfirm() {
        const input = document.getElementById("qaNameInput");
        const button = document.getElementById("qaConfirmBtn");
        const name = input?.value.trim() || "";
        const slug = toSlug(name);
        if (!slug || !qaTarget || !skuAdminQuickAddUrl || button?.disabled) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Добавление...";
        try {
          const response = await fetch(skuAdminQuickAddUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": getCookie("csrftoken"),
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ type: qaTarget, name }),
          });
          const result = await response.json();
          if (!response.ok || !result.success || !result.item) {
            throw new Error(result.message || "Не удалось добавить.");
          }

          const selectId = qaTarget === "category" ? "categorySelect" : "brandSelect";
          syncCustomSelectOption(document.getElementById(selectId), result.item.id, result.item.name);
          closeQuickAdd();
          validateStep(1);
        } catch (error) {
          showSkuAdminMessage(error.message || "Не удалось добавить.", true);
          button.disabled = false;
          button.textContent = originalText;
        }
      }

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && document.getElementById("qaBackdrop")?.style.display === "flex") {
          closeQuickAdd();
        }
      });

      window.openQuickAdd = openQuickAdd;
      window.closeQuickAdd = closeQuickAdd;
      window.qaUpdateSlug = qaUpdateSlug;
      window.qaKeydown = qaKeydown;
      window.qaConfirm = qaConfirm;

      document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-quick-add]").forEach((button) => {
          if (button.dataset.quickAddReady === "true") return;
          button.dataset.quickAddReady = "true";
          button.addEventListener("click", (event) => {
            event.preventDefault();
            openQuickAdd(button.dataset.quickAdd);
          });
        });
      });

      // ── STEP NAVIGATION ────────────────────────────
      let currentStep = 1;
      const totalSteps = 6;
      const unlockedUpTo = { val: 1 };

      function goStep(n) {
        if (n > unlockedUpTo.val) return;
        showStep(n);
      }

      function nextStep(dir, from) {
        const step = from || currentStep;
        if (dir > 0) {
          if (!validateStep(step)) {
            return;
          }
          markDone(step);
          const target = step + dir;
          if (target <= totalSteps) {
            unlockedUpTo.val = Math.max(unlockedUpTo.val, target);
            unlockPill(target);
            showStep(target);
          }
        } else {
          const target = step + dir;
          if (target >= 1) {
            showStep(target);
          }
        }
      }

      function showStep(n) {
        document.querySelectorAll(".step-content").forEach((el) => el.classList.remove("active"));
        document.querySelectorAll(".step-pill").forEach((p, i) => {
          p.classList.remove("active");
          if (i + 1 === n) p.classList.add("active");
        });
        const el = document.getElementById("step" + n);
        if (el) el.classList.add("active");
        currentStep = n;
        scheduleSkuAdminStateSave();
        const card = el.querySelector(".wizard-card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        if (n === 1 || n === 2) validateStep(n);
        if (n === 5 && window.skuTreeRefreshLayout) window.skuTreeRefreshLayout(true);
        if (n === 6) updateFinalReview();
      }

      function markDone(step) {
        const pills = document.querySelectorAll("#stepNav .step-pill");
        const idx = step - 1;
        if (idx >= 0 && idx < pills.length) {
          const pill = pills[idx];
          if (pill && !pill.classList.contains("error")) {
            pill.classList.add("done");
            const numEl = pill.querySelector(".step-num");
            if (numEl) numEl.textContent = "✓";
          }
        }
      }

      function unlockPill(step) {
        const pill = document.getElementById("pill" + step);
        if (pill) pill.classList.remove("locked");
      }

      // ── VALIDATION ──────────────────────────────────
      function validateStep(step) {
        if (step === 1) {
          const nameInput = document.getElementById("productName");
          const name = nameInput.value.trim();
          const cat = document.getElementById("categorySelect").value;
          const brand = document.getElementById("brandSelect").value;
          const nameIsSafe = name !== "" && name.length <= 100 && !/[<>]/.test(name);
          const valid = nameIsSafe && cat !== "" && brand !== "";
          nameInput.setCustomValidity(nameIsSafe ? "" : "Введите название без HTML, не длиннее 100 символов.");
          const btn = document.getElementById("step1Next");
          btn.disabled = !valid;
          return valid;
        }
        if (step === 2) {
          const rte = document.getElementById("rteBody");
          const text = rte.innerText.trim();
          const valid = text !== "";
          const btn = document.getElementById("step2Next");
          btn.disabled = !valid;
          return valid;
        }
        if (step === 5) {
          return window.skuTreeValidateFinalPrices ? window.skuTreeValidateFinalPrices() : false;
        }
        return true;
      }

      // ── EVENT LISTENERS FOR VALIDATION ─────────────
      function initCustomSelects() {
        document.querySelectorAll("select").forEach((select) => {
          if (select.dataset.customReady === "true") return;
          select.dataset.customReady = "true";
          select.classList.add("native-hidden");

          const custom = document.createElement("div");
          custom.className = "custom-select";

          const trigger = document.createElement("button");
          trigger.type = "button";
          trigger.className = "custom-select-trigger";

          const menu = document.createElement("div");
          menu.className = "custom-select-menu";

          const updateTrigger = () => {
            const selected = select.options[select.selectedIndex] || select.options[0];
            trigger.textContent = selected ? selected.textContent : "";
          };

          Array.from(select.options).forEach((option) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "custom-select-option";
            item.textContent = option.textContent;
            item.dataset.value = option.value;
            if (option.disabled) item.classList.add("is-disabled");
            if (option.selected) item.classList.add("is-selected");

            item.addEventListener("click", () => {
              if (option.disabled) return;
              select.value = option.value;
              select.dispatchEvent(new Event("change", { bubbles: true }));
              menu.querySelectorAll(".custom-select-option").forEach((el) => el.classList.remove("is-selected"));
              item.classList.add("is-selected");
              updateTrigger();
              custom.classList.remove("open");
              custom.closest(".wizard-card")?.classList.remove("select-open");
            });

            menu.appendChild(item);
          });

          trigger.addEventListener("click", () => {
            document.querySelectorAll(".custom-select.open").forEach((el) => {
              if (el !== custom) el.classList.remove("open");
            });
            custom.classList.toggle("open");
            document.querySelectorAll(".wizard-card.select-open").forEach((card) => {
              if (!card.contains(custom)) card.classList.remove("select-open");
            });
            const card = custom.closest(".wizard-card");
            if (card) card.classList.toggle("select-open", custom.classList.contains("open"));
          });

          trigger.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
              custom.classList.remove("open");
              custom.closest(".wizard-card")?.classList.remove("select-open");
            }
          });

          select.addEventListener("change", () => {
            menu.querySelectorAll(".custom-select-option").forEach((item) => {
              item.classList.toggle("is-selected", item.dataset.value === select.value);
            });
            updateTrigger();
          });

          updateTrigger();
          custom.appendChild(trigger);
          custom.appendChild(menu);
          select.insertAdjacentElement("afterend", custom);
        });

        document.addEventListener("click", (e) => {
          if (e.target.closest(".custom-select")) return;
          document.querySelectorAll(".custom-select.open").forEach((el) => el.classList.remove("open"));
          document.querySelectorAll(".wizard-card.select-open").forEach((card) => card.classList.remove("select-open"));
        });
      }

      function setSelectValue(selectId, value) {
        const select = document.getElementById(selectId);
        if (!select || value === undefined || value === null || value === "") return;
        select.value = String(value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function setExistingMediaPreview(targetId, type, src, label) {
        const thumb = document.getElementById(targetId);
        if (!thumb || !src) return;
        const inputMap = {
          mainImage: '<input type="file" id="mainFileInput" accept="image/*" onchange="handleMainImage(event)" style="display:none">',
          videoThumb: '<input type="file" id="videoFileInput" accept="video/*" onchange="handleVideoFile(event)" style="display:none">',
          posterThumb: '<input type="file" id="posterFileInput" accept="image/*" onchange="handlePosterFile(event)" style="display:none">',
        };
        thumb.className = "media-thumb filled";
        if (type === "video") {
          thumb.innerHTML = `<video src="${src}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" muted></video>${inputMap[targetId] || ""}`;
          return;
        }
        thumb.innerHTML = `<img src="${src}" alt="${label || ""}" />${inputMap[targetId] || ""}`;
      }

      function addExistingExtraMedia(src) {
        const grid = document.getElementById("extraMediaGrid");
        const trigger = document.getElementById("extraAddTrigger");
        if (!grid || !trigger || !src) return;
        const thumb = document.createElement("div");
        thumb.className = "media-thumb filled";
        thumb.innerHTML = `<img src="${src}" alt="" />`;
        grid.insertBefore(thumb, trigger);
      }

      function setEditCharacteristics(chars) {
        const rows = document.getElementById("charRows");
        if (!rows || !Array.isArray(chars)) return;
        rows.innerHTML = "";
        chars.forEach((item) => {
          const row = document.createElement("div");
          row.className = "char-row";
          row.innerHTML = `
            <input type="text" placeholder="РҐР°СЂР°РєС‚РµСЂРёСЃС‚РёРєР°">
            <input type="text" placeholder="Р—РЅР°С‡РµРЅРёРµ">
            <button class="char-del" onclick="delChar(this)">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>`;
          const inputs = row.querySelectorAll("input");
          inputs[0].value = item.key || "";
          inputs[1].value = item.value || "";
          rows.appendChild(row);
        });
        updateCharEmpty();
      }

      function skuEditNodeStateFromPrices(price, oldPrice, quantity, available) {
        const finalPrice = Number(price);
        const basePrice = Number(oldPrice || price);
        const hasSale = Number.isFinite(basePrice) && Number.isFinite(finalPrice) && basePrice > finalPrice;
        return {
          basePrice: Number.isFinite(basePrice) && basePrice > 0 ? basePrice : null,
          isPriceManual: Number.isFinite(basePrice) && basePrice > 0,
          discountMode: hasSale ? "sale_price" : "inherit",
          discountValue: null,
          salePriceValue: hasSale ? finalPrice : null,
          isDiscountManual: hasSale,
          quantity: quantity === null || quantity === undefined ? 0 : Number(quantity) || 0,
          available: available !== false,
          expanded: false,
        };
      }

      function skuEditSkuNodeId(path) {
        const groups = skuTreeGetGroups();
        if (!groups.length || !Array.isArray(path) || path.length < groups.length) return "";
        let parentId = "product";
        for (let index = 0; index < groups.length - 1; index += 1) {
          const group = groups[index];
          const value = group.values.find((item) => item.name === path[index]);
          if (!value) return "";
          parentId = `${parentId}_g${group.id}_v${value.id}`;
        }
        const finalGroup = groups[groups.length - 1];
        const finalValue = finalGroup.values.find((item) => item.name === path[groups.length - 1]);
        if (!finalValue) return "";
        return `sku_${parentId}_g${finalGroup.id}_v${finalValue.id}`;
      }

      function applyEditSkuTreeState(data) {
        if (!data) return;
        const rootPricing = data.rootPricing || {};
        if (rootPricing.price) {
          skuTreeState.nodeState.set("product", {
            ...skuEditNodeStateFromPrices(rootPricing.price, rootPricing.old_price, null, true),
            quantity: null,
            expanded: true,
          });
        }
        (data.skus || []).forEach((sku) => {
          const nodeId = skuEditSkuNodeId(sku.path || []);
          if (!nodeId) return;
          skuTreeState.nodeState.set(nodeId, skuEditNodeStateFromPrices(sku.price, sku.old_price, sku.stock, sku.available));
        });
      }

      function applyEditProductData() {
        const data = skuEditProduct;
        if (!data) return;
        document.getElementById("productName").value = data.name || "";
        setSelectValue("categorySelect", data.category);
        setSelectValue("brandSelect", data.brand);
        setSelectValue("statusSelect", data.status || "published");
        setProductLikesAdjustment(data.likesAdjustment || 0);
        document.querySelectorAll("#badgeGroup .badge-opt").forEach((button) => {
          setBadgeSelected(button, (data.badgeCodes || []).includes(button.dataset.badge));
        });
        const rteBody = document.getElementById("rteBody");
        if (rteBody) rteBody.innerHTML = sanitizeRteHtml(data.descriptionHtml || "");
        setEditCharacteristics(data.chars || []);
        setExistingMediaPreview("mainImage", "image", data.media?.main, data.name);
        (data.media?.extra || []).forEach(addExistingExtraMedia);
        setExistingMediaPreview("videoThumb", "video", data.media?.video, data.name);
        setExistingMediaPreview("posterThumb", "image", data.media?.poster, data.name);
        if (Array.isArray(data.groups) && window.loadVariantGroups) {
          window.loadVariantGroups(data.groups);
        }
        applyEditSkuTreeState(data);
        unlockedUpTo.val = totalSteps;
        for (let i = 1; i <= totalSteps; i += 1) unlockPill(i);
        validateStep(1);
        validateStep(2);
      }

      document.addEventListener("DOMContentLoaded", function () {
        const nameInput = document.getElementById("productName");
        const catSelect = document.getElementById("categorySelect");
        const brandSelect = document.getElementById("brandSelect");
        const rteBody = document.getElementById("rteBody");
        const likesAdjustmentInput = document.getElementById("productLikesAdjustment");
        const likesMinusButton = document.getElementById("productLikesMinus");
        const likesPlusButton = document.getElementById("productLikesPlus");

        likesAdjustmentInput?.addEventListener("input", updateProductLikesAdjustmentUi);
        likesAdjustmentInput?.addEventListener("blur", updateProductLikesAdjustmentUi);
        likesAdjustmentInput?.addEventListener("keydown", function (event) {
          if (event.key !== "Enter") return;
          event.preventDefault();
          this.blur();
        });
        likesMinusButton?.addEventListener("click", () => {
          setProductLikesAdjustment(Number(likesAdjustmentInput?.value || 0) - 1);
          scheduleSkuAdminStateSave();
        });
        likesPlusButton?.addEventListener("click", () => {
          setProductLikesAdjustment(Number(likesAdjustmentInput?.value || 0) + 1);
          scheduleSkuAdminStateSave();
        });

        nameInput.addEventListener("input", function () {
          validateStep(1);
        });
        nameInput.addEventListener("blur", function () {
          this.value = this.value.trim();
          validateStep(1);
        });
        nameInput.addEventListener("keydown", function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          validateStep(1);
          this.blur();
        });
        catSelect.addEventListener("change", function () {
          validateStep(1);
        });
        brandSelect.addEventListener("change", function () {
          validateStep(1);
        });

        rteBody.addEventListener("input", function () {
          validateStep(2);
        });
        rteBody.addEventListener("blur", function () {
          this.innerHTML = sanitizeRteHtml(this.innerHTML);
          validateStep(2);
        });

        validateStep(1);
        validateStep(2);
        initCustomSelects();

        // Badge toggle
        document.querySelectorAll(".badge-opt").forEach((b) => {
          setBadgeSelected(b, b.classList.contains("selected"));
          b.addEventListener("click", function (e) {
            if (syncBadgeSelectionWithDiscount()) return;
            const isSelected = this.classList.contains("selected");
            document.querySelectorAll(".badge-opt").forEach((opt) => setBadgeSelected(opt, false));
            if (!isSelected) {
              setBadgeSelected(this, true);
            }
          });
        });

        document.addEventListener("input", function (event) {
          if (event.target.closest(".tree-price-input, .tree-saleprice-input")) {
            window.setTimeout(syncBadgeSelectionWithDiscount, 0);
          }
        });
        document.addEventListener("change", function (event) {
          if (event.target.closest(".tree-discount-select, .tree-price-input, .tree-saleprice-input")) {
            window.setTimeout(syncBadgeSelectionWithDiscount, 0);
          }
        });

        updateCharEmpty();
        setupRTE();

        // ── Инициализация вариантов ─────────────────
        initVariantGroups();
        applyEditProductData();
        skuTreeInit();
        restoreSkuAdminState();

        document.querySelector(".wave-admin-product-sku")?.addEventListener("input", scheduleSkuAdminStateSave);
        document.querySelector(".wave-admin-product-sku")?.addEventListener("change", scheduleSkuAdminStateSave);
        document.querySelector(".wave-admin-product-sku")?.addEventListener("click", (event) => {
          if (event.target.closest(".badge-opt, .char-del, .expand-trigger, .input-add-btn, .custom-select-option, #addGroupBtn, .vg-combobox-option, .variant-chip, .variant-group-actions, .variant-group-del, .variant-img-toggle, .variant-photo-del, .sku-tree-widget")) {
            window.setTimeout(scheduleSkuAdminStateSave, 0);
          }
        });
      });

      function toggleBadge(btn) {
        /* handled by event listener */
      }

      function setBadgeSelected(button, selected) {
        if (!button) return;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      }

      // ── TOGGLES ────────────────────────────────────
      function toggleExtra() {
        const el = document.getElementById("extraFields");
        const trigger = document.getElementById("extraToggle");
        const shown = el.style.display !== "none";
        el.style.display = shown ? "none" : "block";
        trigger.classList.toggle("open", !shown);
      }

      function toggleChars() {
        const el = document.getElementById("charBlock");
        const trigger = document.getElementById("charToggle");
        const shown = el.style.display !== "none";
        el.style.display = shown ? "none" : "block";
        trigger.classList.toggle("open", !shown);
        if (!shown) updateCharEmpty();
      }

      function toggleVideo() {
        const el = document.getElementById("videoBlock");
        const trigger = document.getElementById("videoToggle");
        const shown = el.style.display !== "none";
        el.style.display = shown ? "none" : "block";
        trigger.classList.toggle("open", !shown);
      }

      // ── CHARACTERISTICS ────────────────────────────
      function addChar() {
        const rows = document.getElementById("charRows");
        const row = document.createElement("div");
        row.className = "char-row";
        row.innerHTML = `
            <input type="text" placeholder="Характеристика">
            <input type="text" placeholder="Значение">
            <button class="char-del" onclick="delChar(this)">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>`;
        rows.appendChild(row);
        row.querySelector("input").focus();
        updateCharEmpty();
      }

      function delChar(btn) {
        btn.closest(".char-row").remove();
        updateCharEmpty();
      }

      function updateCharEmpty() {
        const rows = document.getElementById("charRows");
        const empty = document.getElementById("charEmpty");
        if (rows.children.length === 0) {
          empty.style.display = "block";
        } else {
          empty.style.display = "none";
        }
      }

      // ── RTE ─────────────────────────────────────────
      let savedRteRange = null;

      function saveRteSelection() {
        const rteBody = document.getElementById("rteBody");
        const selection = window.getSelection();
        if (!rteBody || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (rteBody.contains(range.commonAncestorContainer)) {
          savedRteRange = range.cloneRange();
        }
      }

      function restoreRteSelection() {
        const rteBody = document.getElementById("rteBody");
        if (!rteBody) return null;
        rteBody.focus();
        const selection = window.getSelection();
        selection.removeAllRanges();
        if (!savedRteRange) {
          savedRteRange = document.createRange();
          savedRteRange.selectNodeContents(rteBody);
          savedRteRange.collapse(false);
        }
        selection.addRange(savedRteRange);
        return selection;
      }

      function setupRTE() {
        const toolbar = document.querySelector(".rte-toolbar");
        const rteBody = document.getElementById("rteBody");
        if (!toolbar || !rteBody) return;

        document.execCommand("defaultParagraphSeparator", false, "p");
        document.execCommand("styleWithCSS", false, false);

        toolbar.querySelectorAll(".rte-btn").forEach((button) => {
          button.type = "button";
        });

        toolbar.addEventListener("mousedown", function (e) {
          if (e.target.closest(".rte-btn")) e.preventDefault();
        });

        toolbar.addEventListener("click", function (e) {
          const btn = e.target.closest(".rte-btn");
          if (!btn) return;
          e.preventDefault();
          const command = btn.dataset.command;
          if (!command) return;

          let value = null;
          if (command === "formatBlock") {
            value = btn.dataset.tag || "h1";
          } else if (command === "createLink") {
            const url = prompt("Введите URL ссылки:", "https://");
            if (url) {
              value = url;
            } else {
              return;
            }
          }

          const selection = restoreRteSelection();
          if (!selection) return;

          if (command === "createLink" && value) {
            if (selection.isCollapsed) {
              const anchor = document.createElement("a");
              anchor.href = value;
              anchor.rel = "noopener noreferrer";
              anchor.textContent = "ссылка";
              document.execCommand("insertHTML", false, anchor.outerHTML);
            } else {
              document.execCommand(command, false, value);
            }
          } else if (command === "formatBlock") {
            document.execCommand("formatBlock", false, `<${value}>`);
          } else {
            document.execCommand(command, false, null);
          }

          rteBody.focus();
          saveRteSelection();
          rteBody.dispatchEvent(new Event("input"));
          updateRTEButtons();
        });

        document.addEventListener("selectionchange", function () {
          saveRteSelection();
          updateRTEButtons();
        });

        ["keyup", "mouseup", "input"].forEach((eventName) => {
          rteBody.addEventListener(eventName, saveRteSelection);
        });

        updateRTEButtons();
      }

      function updateRTEButtons() {
        const rteBody = document.getElementById("rteBody");
        if (!rteBody) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (!rteBody.contains(range.commonAncestorContainer)) return;

        const btns = document.querySelectorAll(".rte-btn");
        btns.forEach((btn) => {
          const command = btn.dataset.command;
          if (!command) return;
          let active = false;
          try {
            if (command === "formatBlock") {
              const parent = range.commonAncestorContainer;
              const block = parent.nodeType === 3 ? parent.parentElement : parent;
              const tag = btn.dataset.tag;
              if (block && block.tagName && block.tagName.toLowerCase() === tag) {
                active = true;
              }
            } else {
              active = document.queryCommandState(command);
            }
          } catch (e) {
            /* ignore */
          }
          btn.classList.toggle("active", active);
        });
      }

      // ── MEDIA UPLOAD ──────────────────────────────
      function handleMainImage(e) {
        const file = e.target.files[0];
        if (!file) return;
        skuUploadState.mainImage = file;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const thumb = document.getElementById("mainImage");
          thumb.className = "media-thumb filled";
          thumb.innerHTML = `
                <img src="${ev.target.result}" alt="Главное изображение" />
                <div class="media-overlay">
                  <button class="thumb-icon-btn" title="Заменить" onclick="event.stopPropagation(); document.getElementById('mainFileInput').click()">⟳</button>
                  <button class="thumb-icon-btn" title="Удалить" onclick="event.stopPropagation(); removeMainImage()">✕</button>
                </div>`;
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      }

      function removeMainImage() {
        skuUploadState.mainImage = null;
        const thumb = document.getElementById("mainImage");
        thumb.className = "media-thumb";
        thumb.innerHTML = `
            <svg class="upload-icon" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span class="upload-label">Загрузить</span>
            <input type="file" id="mainFileInput" accept="image/*" onchange="handleMainImage(event)" style="display:none">`;
        document.getElementById("mainFileInput").value = "";
      }

      function handleExtraImages(e) {
        const files = e.target.files;
        const grid = document.getElementById("extraMediaGrid");
        const trigger = document.getElementById("extraAddTrigger");
        for (const file of files) {
          const fileIndex = skuUploadState.extraImages.push(file) - 1;
          const reader = new FileReader();
          reader.onload = function (ev) {
            const thumb = document.createElement("div");
            thumb.className = "media-thumb filled";
            thumb.dataset.fileIndex = String(fileIndex);
            thumb.innerHTML = `
                    <img src="${ev.target.result}" alt="Доп. изображение" />
                    <div class="media-overlay">
                      <button class="thumb-icon-btn" title="Удалить" onclick="event.stopPropagation(); removeExtraImage(this)">✕</button>
                    </div>`;
            grid.insertBefore(thumb, trigger);
          };
          reader.readAsDataURL(file);
        }
        e.target.value = "";
      }

      function removeExtraImage(btn) {
        const thumb = btn.closest(".media-thumb");
        const fileIndex = Number(thumb?.dataset.fileIndex);
        if (Number.isInteger(fileIndex)) skuUploadState.extraImages[fileIndex] = null;
        if (thumb) thumb.remove();
      }

      function handleVideoFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        skuUploadState.promoVideo = file;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const thumb = document.getElementById("videoThumb");
          thumb.className = "media-thumb filled";
          thumb.innerHTML = `
                <video src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" muted></video>
                <div class="media-overlay">
                  <button class="thumb-icon-btn" title="Заменить" onclick="event.stopPropagation(); document.getElementById('videoFileInput').click()">⟳</button>
                  <button class="thumb-icon-btn" title="Удалить" onclick="event.stopPropagation(); removeVideoFile()">✕</button>
                </div>`;
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      }

      function removeVideoFile() {
        skuUploadState.promoVideo = null;
        const thumb = document.getElementById("videoThumb");
        thumb.className = "media-thumb";
        thumb.innerHTML = `
            <svg class="upload-icon" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span class="upload-label">Загрузить видео</span>
            <input type="file" id="videoFileInput" accept="video/*" onchange="handleVideoFile(event)" style="display:none">`;
        document.getElementById("videoFileInput").value = "";
      }

      function handlePosterFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        skuUploadState.promoVideoPoster = file;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const thumb = document.getElementById("posterThumb");
          thumb.className = "media-thumb filled";
          thumb.innerHTML = `
                <img src="${ev.target.result}" alt="Постер" />
                <div class="media-overlay">
                  <button class="thumb-icon-btn" title="Заменить" onclick="event.stopPropagation(); document.getElementById('posterFileInput').click()">⟳</button>
                  <button class="thumb-icon-btn" title="Удалить" onclick="event.stopPropagation(); removePosterFile()">✕</button>
                </div>`;
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      }

      function removePosterFile() {
        skuUploadState.promoVideoPoster = null;
        const thumb = document.getElementById("posterThumb");
        thumb.className = "media-thumb";
        thumb.innerHTML = `
            <svg class="upload-icon" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span class="upload-label">Загрузить постер</span>
            <input type="file" id="posterFileInput" accept="image/*" onchange="handlePosterFile(event)" style="display:none">`;
        document.getElementById("posterFileInput").value = "";
      }

      // ─────────────────────────────────────────────────────────────
      // ── СОСТОЯНИЕ ВАРИАНТОВ ДЛЯ UI И SKU ──────────
      let variantGroups = [];
      let nextGroupId = 1;
      let nextVariantId = 1;
      let activeImageGroupId = null;
      const MAX_GROUPS = 4;
      const MAX_VARIANTS_PER_GROUP = 40;

      // SKU Tree
      const skuTreeState = {
        treeRoot: null,
        allNodesFlat: [],
        nodesByLevel: [],
        skuNodes: [],
        nodeState: new Map(),
        columnNames: [],
        currentLayout: null,
      };
      const skuDiscountOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
      const SKU_PRODUCT_COL_WIDTH = 218;
      const SKU_GROUP_COL_WIDTH = 218;
      const SKU_COL_WIDTH = 258;
      const SKU_COL_GAP = 24;
      const SKU_TOP_PAD = 34;
      const SKU_BOTTOM_PAD = 14;
      const SKU_PRODUCT_NODE_H = 176;
      const SKU_GROUP_NODE_H = 176;
      const SKU_NODE_H = 196;
      const SKU_COLLAPSED_NODE_H = 50;
      const SKU_COLLAPSED_GROUP_H = 28;
      const SKU_V_GAP = 8;
      const SKU_NODE_HEIGHT_PAD = 2;

      function skuTreeGetProductName() {
        const input = document.getElementById("productName");
        const value = input ? input.value.trim() : "";
        return value || "\u0422\u043e\u0432\u0430\u0440";
      }

      function skuTreeGetGroups() {
        return variantGroups.map((group) => ({
          id: group.id,
          name: (group.name || "").trim() || "\u0413\u0440\u0443\u043f\u043f\u0430",
          hasImages: Boolean(group.hasImages),
          values: group.variants.map((variant, variantIndex) => ({
            id: variant.id,
            name: (variant.name || "").trim() || "\u0412\u0430\u0440\u0438\u0430\u043d\u0442",
            filter_name: (variant.filterName || variant.name || "").trim() || "\u0412\u0430\u0440\u0438\u0430\u043d\u0442",
            image_order: Number.isFinite(Number(variant.imageOrder)) ? Number(variant.imageOrder) : variantIndex,
          })),
        }));
      }

      function skuTreeCreateNode(base) {
        const saved = skuTreeState.nodeState.get(base.id) || {};
        return {
          ...base,
          basePrice: saved.basePrice ?? null,
          isPriceManual: saved.isPriceManual ?? false,
          discountMode: saved.discountMode || "inherit",
          discountValue: saved.discountValue ?? null,
          salePriceValue: saved.salePriceValue ?? null,
          isDiscountManual: saved.isDiscountManual ?? false,
          quantity: saved.quantity ?? (base.isSKU ? 10 : null),
          available: saved.available ?? true,
          expanded: saved.expanded ?? (base.id === "product"),
          _measuredHeight: saved._measuredHeight ?? null,
          children: [],
        };
      }

      function skuTreeRememberState() {
        for (const node of skuTreeState.allNodesFlat) {
          skuTreeState.nodeState.set(node.id, {
            basePrice: node.basePrice,
            isPriceManual: node.isPriceManual,
            discountMode: node.discountMode,
            discountValue: node.discountValue,
            salePriceValue: node.salePriceValue,
            isDiscountManual: node.isDiscountManual,
            quantity: node.quantity,
            available: node.available,
            expanded: node.expanded,
            _measuredHeight: node._measuredHeight,
          });
        }
      }

      function skuTreeBuild() {
        skuTreeRememberState();
        const groups = skuTreeGetGroups();
        const branchGroups = groups.slice(0, Math.max(0, groups.length - 1));
        const finalGroup = groups.length ? groups[groups.length - 1] : null;
        const root = skuTreeCreateNode({
          id: "product",
          level: 0,
          name: skuTreeGetProductName(),
          path: [],
          parent: null,
          groupIndex: -1,
          valueIndex: -1,
          isSKU: false,
        });

        skuTreeState.treeRoot = root;
        skuTreeState.nodesByLevel = [[root]];
        skuTreeState.allNodesFlat = [root];
        skuTreeState.skuNodes = [];
        skuTreeState.columnNames = ["", ...branchGroups.map((group) => group.name), "SKU"];

        let parents = [root];
        branchGroups.forEach((group, groupIndex) => {
          skuTreeState.nodesByLevel[groupIndex + 1] = [];
          if (!parents.length) return;
          if (!group.values.length) {
            parents = [];
            return;
          }
          const nextParents = [];
          for (const parent of parents) {
            group.values.forEach((value, valueIndex) => {
              const id = `${parent.id}_g${group.id}_v${value.id}`;
              const node = skuTreeCreateNode({
                id,
                level: groupIndex + 1,
                name: value.name,
                columnName: group.name,
                path: [...parent.path, value.name],
                parent,
                groupIndex,
                valueIndex,
                isSKU: false,
              });
              parent.children.push(node);
              skuTreeState.nodesByLevel[groupIndex + 1].push(node);
              skuTreeState.allNodesFlat.push(node);
              nextParents.push(node);
            });
          }
          parents = nextParents.length ? nextParents : parents;
        });

        const skuLevel = branchGroups.length + 1;
        skuTreeState.nodesByLevel[skuLevel] = [];
        if (finalGroup && finalGroup.values.length && parents.length) {
          for (const parent of parents) {
            finalGroup.values.forEach((value, valueIndex) => {
              const path = [...parent.path, value.name];
              const id = `sku_${parent.id}_g${finalGroup.id}_v${value.id}`;
              const node = skuTreeCreateNode({
                id,
                level: skuLevel,
                name: path.join(" / "),
                columnName: "SKU",
                path,
                parent,
                groupIndex: groups.length - 1,
                valueIndex,
                isSKU: true,
              });
              parent.children.push(node);
              skuTreeState.nodesByLevel[skuLevel].push(node);
              skuTreeState.allNodesFlat.push(node);
              skuTreeState.skuNodes.push(node);
            });
          }
        }

        skuTreeRecalculateAll();
        skuTreeUpdateNextButton();
      }

      function skuTreeIsRenderable(node) {
        if (node === skuTreeState.treeRoot) return true;
        let current = node.parent;
        while (current) {
          if (current.available === false) return false;
          current = current.parent;
        }
        return true;
      }

      function skuTreeHasDisabledAncestor(node) {
        let current = node.parent;
        while (current) {
          if (current.available === false) return true;
          current = current.parent;
        }
        return false;
      }

      function skuTreeGetEffectivePrice(node) {
        let current = node;
        while (current) {
          if (current.isPriceManual && current.basePrice !== null && current.basePrice !== undefined) {
            return { price: current.basePrice, source: current, isManual: current === node && current.isPriceManual };
          }
          current = current.parent;
        }
        return { price: null, source: null, isManual: false };
      }

      function skuTreeGetEffectiveDiscount(node) {
        let current = node;
        while (current) {
          if (current.isDiscountManual) {
            if (current.discountMode === "discount_percent" && current.discountValue !== null && current.discountValue !== undefined) {
              return { discount: current.discountValue, source: current, isManual: current === node, mode: "discount_percent" };
            }
            if (current.discountMode === "sale_price" && current.salePriceValue !== null && current.salePriceValue !== undefined) {
              return { salePrice: current.salePriceValue, source: current, isManual: current === node, mode: "sale_price" };
            }
          }
          current = current.parent;
        }
        return { discount: 0, source: null, isManual: false, mode: "inherit" };
      }

      function skuTreeSourceName(node) {
        if (!node) return "\u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u043e";
        if (node.level === 0) return "\u0422\u043e\u0432\u0430\u0440";
        if (node.isSKU) return `SKU "${node.name}"`;
        return `\u0432\u0435\u0442\u043a\u0438 "${node.path.join(" / ")}"`;
      }

      function skuTreeSalePrice(basePrice, discount) {
        if (basePrice === null || basePrice === undefined || isNaN(basePrice)) return null;
        return Math.round(basePrice * (1 - discount / 100) * 100) / 100;
      }

      function skuTreeDiscountFromSale(basePrice, salePrice) {
        if (basePrice <= 0) return 0;
        return Math.round(Math.max(0, Math.min(99.9, (1 - salePrice / basePrice) * 100)) * 10) / 10;
      }

      function skuTreeRoundDiscount(value) {
        return Math.max(0, Math.min(95, Math.round(value / 5) * 5));
      }

      function skuTreeMoney(value) {
        if (value === null || value === undefined || value === "") return "";
        const num = parseFloat(value);
        return Number.isFinite(num) ? num.toFixed(2) : "";
      }

      const SKU_MAX_PRICE_INTEGER_DIGITS = 8;
      const SKU_MAX_QUANTITY = 2147483647;

      function skuTreeNormalizeDecimalInput(input) {
        let value = input.value.replace(",", ".").replace(/[^0-9.]/g, "");
        const dotIndex = value.indexOf(".");
        if (dotIndex === -1) {
          value = value.slice(0, SKU_MAX_PRICE_INTEGER_DIGITS);
        } else {
          const integerPart = value.slice(0, dotIndex).replace(/\./g, "").slice(0, SKU_MAX_PRICE_INTEGER_DIGITS);
          const decimalPart = value.slice(dotIndex + 1).replace(/\./g, "").slice(0, 2);
          value = `${integerPart}.${decimalPart}`;
        }
        input.value = value;
        return value;
      }

      function skuTreeNormalizeQuantityInput(input) {
        const value = input.value.replace(/\D/g, "").slice(0, 10);
        input.value = value;
        return value;
      }

      function skuTreeSetInputValidity(input, valid, message = "") {
        input.classList.toggle("numeric-input-invalid", !valid);
        input.setAttribute("aria-invalid", valid ? "false" : "true");
        input.setCustomValidity(valid ? "" : message);
      }

      function skuTreeValidatePriceInput(input, node) {
        const value = skuTreeNormalizeDecimalInput(input);
        if (!value) {
          skuTreeSetInputValidity(input, true);
          return { valid: true, value: "" };
        }
        const number = Number(value);
        let valid = /^\d{0,8}(?:\.\d{0,2})?$/.test(value) && Number.isFinite(number) && number > 0;
        let message = "Введите положительную цену, максимум с двумя знаками после запятой.";
        if (valid && input.classList.contains("tree-saleprice-input") && Number(node?._effPrice) > 0 && number > Number(node._effPrice)) {
          valid = false;
          message = "Цена со скидкой не может быть выше базовой цены.";
        }
        skuTreeSetInputValidity(input, valid, message);
        return { valid, value };
      }

      function skuTreeValidateQuantityInput(input) {
        const value = skuTreeNormalizeQuantityInput(input);
        const number = Number(value);
        const valid = value !== "" && /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= 0 && number <= SKU_MAX_QUANTITY;
        skuTreeSetInputValidity(input, valid, `Введите целое количество от 0 до ${SKU_MAX_QUANTITY}.`);
        return { valid, value };
      }

      function skuTreeHasFinalSkuPrice(node) {
        const price = parseFloat(node._effPrice);
        const salePrice = parseFloat(node._effSalePrice);
        return (Number.isFinite(price) && price > 0) || (Number.isFinite(salePrice) && salePrice > 0);
      }

      function skuTreeValidateFinalPrices() {
        const valid = skuTreeState.skuNodes.length > 0 && skuTreeState.skuNodes.every((node) => (
          skuTreeHasFinalSkuPrice(node)
          && Number.isSafeInteger(node.quantity)
          && node.quantity >= 0
          && node.quantity <= SKU_MAX_QUANTITY
          && !node._priceInputInvalid
          && !node._salePriceInputInvalid
          && !node._quantityInputInvalid
        ));
        const btn = document.getElementById("step5Next");
        if (btn) btn.disabled = !valid;
        return valid;
      }

      function skuTreeUpdateNextButton() {
        skuTreeValidateFinalPrices();
      }

      function skuTreeRecalculateAll() {
        for (const node of skuTreeState.allNodesFlat) {
          const price = skuTreeGetEffectivePrice(node);
          node._effPrice = price.price;
          node._priceSource = price.source;
          node._priceSourceName = skuTreeSourceName(price.source);
          node._priceIsManual = price.isManual;

          const disc = skuTreeGetEffectiveDiscount(node);
          if (disc.mode === "sale_price") {
            node._effSalePrice = disc.salePrice;
            node._effDiscount = skuTreeRoundDiscount(skuTreeDiscountFromSale(node._effPrice, disc.salePrice));
            node._discountMode = "sale_price";
          } else {
            node._effDiscount = disc.discount;
            node._effSalePrice = skuTreeSalePrice(node._effPrice, disc.discount);
            node._discountMode = disc.mode;
          }
          node._discountSource = disc.source;
          node._discountSourceName = skuTreeSourceName(disc.source);
          node._discountIsManual = disc.isManual;
        }
        skuTreeUpdateNextButton();
      }

      function skuTreeSetNodePrice(node, rawValue, shouldRender = true) {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
          node.basePrice = null;
          node.isPriceManual = false;
        } else {
          const val = parseFloat(rawValue.toString().replace(",", ".").replace(/[^0-9.]/g, ""));
          if (isNaN(val) || val <= 0) return;
          node.basePrice = val;
          node.isPriceManual = true;
        }
        skuTreeRecalculateAll();
        if (shouldRender) skuTreeRenderAll();
      }

      function skuTreeSetDiscount(node, rawValue) {
        const val = rawValue === "" || rawValue === null ? null : parseFloat(rawValue);
        if (val === null || isNaN(val)) return skuTreeResetDiscount(node);
        node.discountMode = "discount_percent";
        node.discountValue = Math.max(0, Math.min(95, val));
        node.salePriceValue = skuTreeSalePrice(node._effPrice, node.discountValue);
        node.isDiscountManual = true;
        skuTreeRecalculateAll();
        skuTreeRenderAll();
      }

      function skuTreeSetSalePrice(node, rawValue, shouldRender = true) {
        const val = parseFloat(rawValue.toString().replace(",", ".").replace(/[^0-9.]/g, ""));
        if (isNaN(val) || val <= 0 || (Number(node._effPrice) > 0 && val > Number(node._effPrice))) return;
        node.discountMode = "sale_price";
        node.salePriceValue = Math.round(val * 100) / 100;
        node.discountValue = skuTreeRoundDiscount(skuTreeDiscountFromSale(node._effPrice, val));
        node.isDiscountManual = true;
        skuTreeRecalculateAll();
        if (shouldRender) skuTreeRenderAll();
      }

      function skuTreeResetDiscount(node, shouldRender = true) {
        node.discountMode = "inherit";
        node.discountValue = null;
        node.salePriceValue = null;
        node.isDiscountManual = false;
        skuTreeRecalculateAll();
        if (shouldRender) skuTreeRenderAll();
      }

      function skuTreeSetQuantity(node, rawValue) {
        node.quantity = Math.max(0, parseInt(rawValue.toString().replace(/[^0-9]/g, "")) || 0);
      }

      function skuTreeAdjustQuantity(input, node, direction, largeStep = false) {
        const currentValue = /^\d+$/.test(input.value) ? Number(input.value) : Number(node.quantity) || 0;
        const amount = largeStep ? 10 : 1;
        const nextValue = Math.min(SKU_MAX_QUANTITY, Math.max(0, currentValue + direction * amount));
        input.value = String(nextValue);
        node.quantity = nextValue;
        node._quantityInputInvalid = false;
        skuTreeSetInputValidity(input, true);
        skuTreeUpdateNextButton();
        scheduleSkuAdminStateSave();
      }

      function skuTreeGetColumnWidth(level) {
        if (level === 0) return SKU_PRODUCT_COL_WIDTH;
        if (level === skuTreeState.nodesByLevel.length - 1) return SKU_COL_WIDTH;
        const nodes = skuTreeState.nodesByLevel[level] || [];
        const titleWidth = Math.ceil(nodes.reduce((max, node) => Math.max(max, skuTreeMeasureText(node.name, "600 13px Inter, sans-serif")), 0));
        const compactWidth = titleWidth + 90;
        const expandedWidth = nodes.some((node) => node.expanded && skuTreeIsRenderable(node)) ? SKU_GROUP_COL_WIDTH : 0;
        return Math.max(92, compactWidth, expandedWidth);
      }

      function skuTreeMeasureText(text, font) {
        const canvas = skuTreeMeasureText._canvas || (skuTreeMeasureText._canvas = document.createElement("canvas"));
        const ctx = canvas.getContext("2d");
        ctx.font = font;
        return ctx.measureText(text || "").width;
      }

      function skuTreeGetNodeHeight(node) {
        if (node._measuredHeight) return node._measuredHeight;
        if (!node.expanded) return node.isSKU ? SKU_COLLAPSED_NODE_H : SKU_COLLAPSED_GROUP_H;
        if (node.level === 0) return SKU_PRODUCT_NODE_H;
        if (node.isSKU) return SKU_NODE_H;
        return SKU_GROUP_NODE_H;
      }

      function skuTreeGetLayoutChildren(node) {
        if (node !== skuTreeState.treeRoot && node.available === false) return [];
        return node.children.filter(skuTreeIsRenderable);
      }

      function skuTreeCalcSubtree(node) {
        const children = skuTreeGetLayoutChildren(node).map(skuTreeCalcSubtree);
        const ownHeight = skuTreeGetNodeHeight(node);
        const childHeight = children.length ? children.reduce((sum, child) => sum + child.height, 0) + SKU_V_GAP * (children.length - 1) : 0;
        return { node, children, height: Math.max(ownHeight, childHeight) };
      }

      function skuTreeAssignCenters(layout, top, centers) {
        centers[layout.node.id] = top + layout.height / 2;
        if (!layout.children.length) return;
        const childHeight = layout.children.reduce((sum, child) => sum + child.height, 0) + SKU_V_GAP * (layout.children.length - 1);
        let childTop = top + (layout.height - childHeight) / 2;
        for (const child of layout.children) {
          skuTreeAssignCenters(child, childTop, centers);
          childTop += child.height + SKU_V_GAP;
        }
      }

      function skuTreeCalculateLayout() {
        const treeLayout = skuTreeCalcSubtree(skuTreeState.treeRoot);
        const centers = {};
        skuTreeAssignCenters(treeLayout, SKU_TOP_PAD, centers);
        const colXPositions = [];
        let x = 0;
        for (let level = 0; level < skuTreeState.nodesByLevel.length; level++) {
          colXPositions.push(x);
          x += skuTreeGetColumnWidth(level);
          if (level < skuTreeState.nodesByLevel.length - 1) x += SKU_COL_GAP;
        }
        return { totalHeight: treeLayout.height + SKU_TOP_PAD + SKU_BOTTOM_PAD, totalWidth: x, centers, colXPositions, numCols: skuTreeState.nodesByLevel.length };
      }

      function skuTreeRenderAll() {
        const outer = document.getElementById("treeOuter");
        const inner = document.getElementById("treeInner");
        const svg = document.getElementById("treeSvg");
        const columns = document.getElementById("treeColumns");
        if (!outer || !inner || !svg || !columns || !skuTreeState.treeRoot) return;
        const layout = skuTreeCalculateLayout();
        skuTreeState.currentLayout = layout;
        inner.style.width = layout.totalWidth + "px";
        inner.style.height = layout.totalHeight + "px";
        svg.setAttribute("width", layout.totalWidth);
        svg.setAttribute("height", layout.totalHeight);
        svg.style.width = layout.totalWidth + "px";
        svg.style.height = layout.totalHeight + "px";
        columns.innerHTML = "";

        for (let level = 0; level < layout.numCols; level++) {
          const col = document.createElement("div");
          col.className = "tree-col";
          col.style.width = skuTreeGetColumnWidth(level) + "px";
          col.style.marginRight = level < layout.numCols - 1 ? SKU_COL_GAP + "px" : "0";
          col.style.minHeight = layout.totalHeight + "px";
          columns.appendChild(col);

          const label = document.createElement("div");
          label.style.cssText = "position:absolute;top:8px;left:0;right:0;text-align:center;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);";
          label.textContent = skuTreeState.columnNames[level] || "";
          col.appendChild(label);
        }

        for (let level = 0; level < layout.numCols; level++) {
          const col = columns.children[level];
          const nodes = (skuTreeState.nodesByLevel[level] || []).filter(skuTreeIsRenderable).sort((a, b) => layout.centers[a.id] - layout.centers[b.id]);
          for (const node of nodes) {
            if (layout.centers[node.id] === undefined) continue;
            const el = skuTreeCreateNodeElement(node);
            const nodeHeight = skuTreeGetNodeHeight(node);
            el.style.position = "absolute";
            el.style.top = layout.centers[node.id] - nodeHeight / 2 + "px";
            el.style.left = "50%";
            el.style.transform = "translateX(-50%)";
            el.style.width = skuTreeGetColumnWidth(level) - 6 + "px";
            col.appendChild(el);
          }
        }

        skuTreeDrawLines(svg, layout);
        skuTreeSyncMeasuredHeights();
      }

      function skuTreeCreateNodeElement(node) {
        const el = document.createElement("div");
        el.className = "node-card";
        el.dataset.nodeId = node.id;
        if (node.available === false) el.classList.add("node-unavailable");
        if (!node.expanded) el.classList.add("node-collapsed");

        const controls = `<div class="node-title-actions"><label class="toggle-switch" title="&#1042; &#1085;&#1072;&#1083;&#1080;&#1095;&#1080;&#1080;"><input type="checkbox" class="node-available-toggle" data-node-id="${node.id}" ${node.available ? "checked" : ""}><span class="toggle-slider"></span></label><button class="node-expand-btn ${node.expanded ? "is-expanded" : ""}" data-node-id="${node.id}" title="&#1053;&#1072;&#1089;&#1090;&#1088;&#1086;&#1081;&#1082;&#1080; &#1094;&#1077;&#1085;&#1099;"><span class="node-expand-icon"></span></button></div>`;
        const status = skuTreeCreateStatus(node);
        const reset = node._discountIsManual || node._priceIsManual ? `<button class="reset-btn" data-node-id="${node.id}">&#1057;&#1073;&#1088;&#1086;&#1089;&#1080;&#1090;&#1100;</button>` : "";
        const priceGrid = `<div class="price-grid"><label>&#1041;&#1072;&#1079;&#1086;&#1074;&#1072;&#1103; &#1094;&#1077;&#1085;&#1072;</label><input type="text" inputmode="decimal" class="tree-price-input ${node._priceIsManual ? "manual" : ""}" data-node-id="${node.id}" value="${skuTreeMoney(node._effPrice)}"><label>&#1057;&#1082;&#1080;&#1076;&#1082;&#1072; %</label><select class="tree-discount-select" data-node-id="${node.id}">${skuDiscountOptions.map((d) => `<option value="${d}" ${Math.abs((node._effDiscount || 0) - d) < 0.05 ? "selected" : ""}>${d}%</option>`).join("")}</select><label>&#1062;&#1077;&#1085;&#1072; &#1089;&#1086; &#1089;&#1082;&#1080;&#1076;&#1082;&#1086;&#1081;</label><input type="text" inputmode="decimal" class="tree-saleprice-input ${node._discountMode === "sale_price" && node._discountIsManual ? "manual" : ""}" data-node-id="${node.id}" value="${skuTreeMoney(node._effSalePrice)}"></div>`;
        const quantityControl = `<div class="sku-qty-stepper"><input type="text" inputmode="numeric" class="sku-qty-input" data-node-id="${node.id}" value="${node.quantity || 0}" aria-label="Количество товара"><span class="sku-qty-stepper-actions"><button class="sku-qty-step" type="button" data-node-id="${node.id}" data-direction="1" aria-label="Увеличить количество"><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 5 5 1l4 4"/></svg></button><button class="sku-qty-step" type="button" data-node-id="${node.id}" data-direction="-1" aria-label="Уменьшить количество"><svg viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4"/></svg></button></span></div>`;

        if (node.isSKU) {
          el.classList.add("sku-card");
          el.innerHTML = `<div class="sku-header"><span class="sku-name">${skuTreeEscape(node.name)}</span>${controls}</div><div class="sku-price-summary ${node.expanded ? "hidden" : ""}">&#1062;&#1077;&#1085;&#1072;: <span>${skuTreeMoney(node._effSalePrice)}</span></div><div class="sku-body ${node.expanded ? "" : "hidden"}"><div class="field-row"><label>&#1050;&#1086;&#1083;-&#1074;&#1086;:</label>${quantityControl}</div>${status}${priceGrid}${reset}</div>`;
          return el;
        }

        el.classList.add(node.level === 0 ? "product-card" : "group-card");
        const titleClass = node.level === 0 ? "node-title-block" : "group-title-block";
        el.innerHTML = `<div class="${titleClass}"><span class="node-title">${skuTreeEscape(node.name)}</span>${controls}</div><div class="group-body ${node.expanded ? "" : "hidden"}">${status}${priceGrid}${reset}</div>`;
        return el;
      }

      function skuTreeCreateStatus(node) {
        if (node._priceSource || node._discountSource) {
          return `<div class="inherit-status inherited" data-node-id="${node.id}">&#1091;&#1085;&#1072;&#1089;&#1083;&#1077;&#1076;&#1086;&#1074;&#1072;&#1085;&#1086;</div>`;
        }
        return `<div class="inherit-status manual">&#1079;&#1072;&#1076;&#1072;&#1085;&#1086;</div>`;
      }

      function skuTreeDrawLines(svg, layout) {
        let html = "";
        for (let level = 0; level < layout.numCols - 1; level++) {
          const parentColWidth = skuTreeGetColumnWidth(level);
          const childColWidth = skuTreeGetColumnWidth(level + 1);
          for (const parent of skuTreeState.nodesByLevel[level] || []) {
            if (!skuTreeIsRenderable(parent) || !parent.children.length) continue;
            const parentY = layout.centers[parent.id];
            if (parentY === undefined) continue;
            const parentX = layout.colXPositions[level] + parentColWidth / 2;
            const parentRight = parentX + (parentColWidth - 6) / 2;
            for (const child of parent.children) {
              if (!skuTreeIsRenderable(child)) continue;
              const childY = layout.centers[child.id];
              if (childY === undefined) continue;
              const childX = layout.colXPositions[level + 1] + childColWidth / 2;
              const childLeft = childX - (childColWidth - 6) / 2;
              const midX = parentRight + (childLeft - parentRight) / 2;
              html += `<path d="M ${parentX} ${parentY} L ${midX} ${parentY} L ${midX} ${childY} L ${childX} ${childY}" data-parent="${parent.id}" data-child="${child.id}" />`;
            }
          }
        }
        svg.innerHTML = html;
      }

      function skuTreeSyncMeasuredHeights() {
        const outer = document.getElementById("treeOuter");
        if (!outer || outer.getBoundingClientRect().width <= 0) return;
        let needsRender = false;
        document.querySelectorAll("#treeInner .node-card[data-node-id]").forEach((el) => {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === el.dataset.nodeId);
          if (!node) return;
          const rect = el.getBoundingClientRect();
          if (rect.height < 10) return;
          const measured = Math.ceil(rect.height) + SKU_NODE_HEIGHT_PAD;
          if (Math.abs((node._measuredHeight || 0) - measured) > 1) {
            node._measuredHeight = measured;
            needsRender = true;
          }
        });
        if (needsRender) requestAnimationFrame(skuTreeRenderAll);
      }

      function skuTreeRefreshLayout(forceMeasure = false) {
        if (!skuTreeState.treeRoot) skuTreeBuild();
        if (forceMeasure) {
          skuTreeState.allNodesFlat.forEach((node) => {
            node._measuredHeight = null;
          });
        }
        requestAnimationFrame(() => {
          skuTreeRenderAll();
          requestAnimationFrame(() => {
            skuTreeSyncMeasuredHeights();
            skuTreeRenderAll();
            skuTreeUpdateNextButton();
          });
        });
      }

      function skuTreeHandleInteraction(e) {
        const target = e.target;
        if (target.closest(".inherit-status.inherited")) {
          const status = target.closest(".inherit-status.inherited");
          if (e.type === "mouseover") skuTreeHighlightInheritance(status.dataset.nodeId, e);
          if (e.type === "mouseout") skuTreeClearHighlights();
          if (e.type === "click") {
            e.preventDefault();
            skuTreeHighlightInheritance(status.dataset.nodeId, e);
          }
          return;
        }
        if (e.type === "click" && target.closest(".node-expand-btn")) {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.closest(".node-expand-btn").dataset.nodeId);
          if (!node) return;
          const shouldExpand = !node.expanded;
          skuTreeState.allNodesFlat.forEach((item) => {
            item.expanded = false;
            item._measuredHeight = null;
          });
          node.expanded = shouldExpand;
          skuTreeRenderAll();
          return;
        }
        if (e.type === "change" && target.closest(".node-available-toggle")) {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.dataset.nodeId);
          if (!node) return;
          node.available = target.checked;
          skuTreeRecalculateAll();
          skuTreeRenderAll();
          return;
        }
        if (e.type === "click" && target.closest(".sku-qty-step")) {
          const button = target.closest(".sku-qty-step");
          const node = skuTreeState.allNodesFlat.find((item) => item.id === button.dataset.nodeId);
          const input = button.closest(".sku-qty-stepper")?.querySelector(".sku-qty-input");
          if (node && input) {
            skuTreeAdjustQuantity(input, node, Number(button.dataset.direction) || 1, e.shiftKey);
          }
          return;
        }
        if (e.type === "keydown" && target.closest(".sku-qty-input") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.dataset.nodeId);
          if (node) skuTreeAdjustQuantity(target, node, e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          return;
        }
        if ((e.type === "input" || e.type === "change") && target.closest(".tree-price-input,.tree-saleprice-input")) {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.dataset.nodeId);
          if (!node) return;
          const validation = skuTreeValidatePriceInput(target, node);
          if (target.classList.contains("tree-saleprice-input")) {
            node._salePriceInputInvalid = !validation.valid;
          } else {
            node._priceInputInvalid = !validation.valid;
          }
          if (!validation.valid) {
            skuTreeUpdateNextButton();
            return;
          }
          const shouldRender = e.type === "change";
          if (target.classList.contains("tree-saleprice-input")) {
            if (validation.value === "") skuTreeResetDiscount(node, shouldRender);
            else skuTreeSetSalePrice(node, target.value, shouldRender);
          } else {
            skuTreeSetNodePrice(node, target.value, shouldRender);
          }
          if (shouldRender) target.value = skuTreeMoney(target.classList.contains("tree-saleprice-input") ? node._effSalePrice : node._effPrice);
          return;
        }
        if (e.type === "change" && target.closest(".tree-discount-select")) {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.dataset.nodeId);
          if (node) skuTreeSetDiscount(node, target.value);
          return;
        }
        if (e.type === "input" && target.closest(".sku-qty-input")) {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.dataset.nodeId);
          if (node) {
            const validation = skuTreeValidateQuantityInput(target);
            node._quantityInputInvalid = !validation.valid;
            if (validation.valid) skuTreeSetQuantity(node, target.value);
            skuTreeUpdateNextButton();
          }
          return;
        }
        if (e.type === "click" && target.closest(".reset-btn")) {
          const node = skuTreeState.allNodesFlat.find((item) => item.id === target.closest(".reset-btn").dataset.nodeId);
          if (!node) return;
          node.basePrice = null;
          node.isPriceManual = false;
          skuTreeResetDiscount(node);
        }
      }

      function skuTreeHighlightInheritance(nodeId, event) {
        skuTreeClearHighlights();
        const node = skuTreeState.allNodesFlat.find((item) => item.id === nodeId);
        if (!node) return;
        const source = node._priceSource || node._discountSource;
        if (!source || source === node) return;
        let current = node;
        while (current && current !== source) {
          const parent = current.parent;
          if (!parent) break;
          const path = document.querySelector(`#treeSvg path[data-parent="${parent.id}"][data-child="${current.id}"]`);
          if (path) path.classList.add("highlight");
          current = parent;
        }
        const sourceEl = document.querySelector(`#treeInner .node-card[data-node-id="${source.id}"]`);
        if (sourceEl) sourceEl.classList.add("source-highlight");
        const tooltip = document.getElementById("inheritTooltip");
        if (tooltip) {
          tooltip.textContent = skuTreeSourceName(source);
          tooltip.style.left = event.clientX + 12 + "px";
          tooltip.style.top = event.clientY + 12 + "px";
          tooltip.classList.add("visible");
        }
      }

      function skuTreeClearHighlights() {
        document.querySelectorAll("#treeSvg path.highlight").forEach((path) => path.classList.remove("highlight"));
        document.querySelectorAll("#treeInner .node-card.source-highlight").forEach((card) => card.classList.remove("source-highlight"));
        const tooltip = document.getElementById("inheritTooltip");
        if (tooltip) tooltip.classList.remove("visible");
      }

      function skuTreeEscape(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
      }

      function skuTreeRebuild() {
        skuTreeBuild();
        skuTreeRenderAll();
      }

      function skuTreeInit() {
        const columns = document.getElementById("treeColumns");
        const outer = document.getElementById("treeOuter");
        const nameInput = document.getElementById("productName");
        if (!columns || !outer) return;
        columns.addEventListener("input", skuTreeHandleInteraction);
        columns.addEventListener("change", skuTreeHandleInteraction);
        columns.addEventListener("click", skuTreeHandleInteraction);
        columns.addEventListener("keydown", skuTreeHandleInteraction);
        columns.addEventListener("mouseover", skuTreeHandleInteraction);
        columns.addEventListener("mouseout", skuTreeHandleInteraction);
        if (nameInput) nameInput.addEventListener("input", skuTreeRebuild);
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let scrollLeft = 0;
        let scrollTop = 0;
        outer.addEventListener("mousedown", (e) => {
          if (e.target.closest("input,select,button,label")) return;
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          scrollLeft = outer.scrollLeft;
          scrollTop = outer.scrollTop;
        });
        window.addEventListener("mousemove", (e) => {
          if (!isDragging) return;
          outer.scrollLeft = scrollLeft - (e.clientX - startX);
          outer.scrollTop = scrollTop - (e.clientY - startY);
        });
        window.addEventListener("mouseup", () => {
          isDragging = false;
        });
        const originalRenderAllGroups = renderAllGroups;
        renderAllGroups = function () {
          originalRenderAllGroups();
          skuTreeRebuild();
        };
        skuTreeRebuild();
        window.skuTreeRebuild = skuTreeRebuild;
        window.skuTreeRefreshLayout = skuTreeRefreshLayout;
        window.skuTreeValidateFinalPrices = skuTreeValidateFinalPrices;
      }

      // ── SAVE DRAFT ─────────────────────────────────
      // Final review
      function finalEscape(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
      }

      function sanitizeRteHtml(value) {
        const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "H1", "H2"]);
        const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME"]);
        const template = document.createElement("template");
        template.innerHTML = String(value || "");

        Array.from(template.content.querySelectorAll("*")).reverse().forEach((element) => {
          if (blockedTags.has(element.tagName)) {
            element.remove();
            return;
          }
          if (!allowedTags.has(element.tagName)) {
            element.replaceWith(...element.childNodes);
            return;
          }
          const href = element.tagName === "A" ? (element.getAttribute("href") || "").trim() : "";
          Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
          if (element.tagName === "A" && href) {
            const normalizedHref = href.toLowerCase();
            if (/^(https?:|mailto:|tel:|\/|#)/.test(normalizedHref) && !normalizedHref.startsWith("javascript:")) {
              element.setAttribute("href", href);
              element.setAttribute("rel", "noopener noreferrer");
            }
          }
        });
        return template.innerHTML.trim();
      }

      function finalSelectText(id) {
        const select = document.getElementById(id);
        if (!select || !select.value) return "";
        const option = select.options[select.selectedIndex];
        return option ? option.textContent.trim() : select.value;
      }

      function getForcedDiscountPercent(skus) {
        const rows = skus || (skuTreeState?.treeRoot ? finalSkuRows() : []);
        return rows.reduce((maxDiscount, sku) => {
          const oldPrice = Number(sku.old_price);
          const price = Number(sku.price);
          if (!Number.isFinite(oldPrice) || !Number.isFinite(price) || oldPrice <= price || oldPrice <= 0) return maxDiscount;
          return Math.max(maxDiscount, Math.round((1 - price / oldPrice) * 100));
        }, 0);
      }

      function syncBadgeSelectionWithDiscount(skus) {
        const badgeGroup = document.getElementById("badgeGroup");
        if (!badgeGroup) return false;
        const discount = getForcedDiscountPercent(skus);
        badgeGroup.classList.toggle("has-forced-sale", discount > 0);
        badgeGroup.dataset.forcedSaleLabel = discount > 0 ? `-${discount}%` : "";
        badgeGroup.setAttribute(
          "aria-label",
          discount > 0 ? `Автоматический бейдж скидки ${discount}%` : "Выбор бейджа товара"
        );
        if (discount > 0) {
          badgeGroup.querySelectorAll(".badge-opt").forEach((button) => setBadgeSelected(button, false));
        }
        return discount > 0;
      }

      function finalGetBadges(skus) {
        const discount = getForcedDiscountPercent(skus);
        if (discount > 0) return [`-${discount}%`];
        return Array.from(document.querySelectorAll("#badgeGroup .badge-opt.selected")).map((btn) => btn.textContent.trim());
      }

      function finalGetCharacteristics() {
        return Array.from(document.querySelectorAll("#charRows .char-row"))
          .map((row) => {
            const inputs = row.querySelectorAll("input");
            return {
              key: (inputs[0]?.value || "").trim(),
              value: (inputs[1]?.value || "").trim(),
            };
          })
          .filter((item) => item.key || item.value);
      }

      function finalGetMedia() {
        const main = document.querySelector("#mainImage img")?.src || "";
        const extra = Array.from(document.querySelectorAll("#extraMediaGrid .media-thumb.filled img")).map((img) => img.src);
        const video = document.querySelector("#videoThumb video")?.src || "";
        const poster = document.querySelector("#posterThumb img")?.src || "";
        return { main, extra, video, poster };
      }

      function finalSkuPrice(node) {
        const sale = parseFloat(node._effSalePrice);
        if (Number.isFinite(sale)) return sale;
        const base = parseFloat(node._effPrice);
        return Number.isFinite(base) ? base : null;
      }

      function finalRootPricing() {
        if (!skuTreeState.treeRoot) skuTreeBuild();
        skuTreeRecalculateAll();
        const root = skuTreeState.treeRoot;
        if (!root || !root.isPriceManual) return { price: null, old_price: null };
        const basePrice = parseFloat(root._effPrice);
        const finalPrice = finalSkuPrice(root);
        const oldPrice = Number.isFinite(basePrice) && finalPrice !== null && basePrice > finalPrice ? basePrice : null;
        return {
          price: finalPrice,
          old_price: oldPrice,
        };
      }

      function finalSkuRows() {
        if (!skuTreeState.treeRoot) skuTreeBuild();
        skuTreeRecalculateAll();
        return skuTreeState.skuNodes.map((node, index) => {
          const basePrice = parseFloat(node._effPrice);
          const finalPrice = finalSkuPrice(node);
          const oldPrice = Number.isFinite(basePrice) && finalPrice !== null && basePrice > finalPrice ? basePrice : null;
          const path = node.path || [];
          return {
            name: node.name,
            path,
            price: finalPrice,
            old_price: oldPrice,
            quantity: node.quantity || 0,
            stock: node.quantity || 0,
            available: node.available !== false && !skuTreeHasDisabledAncestor(node),
            sku_code: path.join("-").replace(/\s+/g, "-").toUpperCase(),
            sort_order: index,
          };
        });
      }

      function finalReadiness(data) {
        const problems = [];
        if (!data.name) problems.push("Заполните название товара.");
        if (data.name.length > 100) problems.push("Название товара должно быть не длиннее 100 символов.");
        if (/[<>]/.test(data.name)) problems.push("Название товара не должно содержать HTML.");
        if (!data.category) problems.push("Выберите категорию.");
        if (!data.brand) problems.push("Выберите бренд.");
        if (!data.descriptionText) problems.push("Добавьте описание.");
        if (!data.media.main) problems.push("Загрузите главное изображение.");
        if (!data.skus.length) problems.push("Создайте финальные SKU.");
        if (data.skus.some((sku) => sku.price === null)) problems.push("Укажите цену для каждого финального SKU.");
        if (data.chars.some((item) => !item.key || !item.value)) problems.push("Заполните название и значение каждой характеристики.");
        return problems;
      }

      function finalBuildPriceTable(groups, skus) {
        const head = [`<th>SKU</th>`, ...groups.map((group) => `<th>${finalEscape(group.name || "Группа")}</th>`), `<th>Цена</th>`].join("");
        const rows = skus.length
          ? skus
              .map((sku) => {
                const cells = groups.map((_, index) => `<td>${finalEscape(sku.path[index] || "")}</td>`).join("");
                const price = sku.price === null ? "Не указана" : skuTreeMoney(sku.price);
                return `<tr><td><strong>${finalEscape(sku.name)}</strong></td>${cells}<td>${finalEscape(price)}</td></tr>`;
              })
              .join("")
          : `<tr><td colspan="${groups.length + 2}" class="final-muted">SKU пока не созданы</td></tr>`;
        return `<div class="final-table-wrap"><table class="final-price-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }

      function finalBuildMedia(media) {
        const items = [];
        if (media.main) items.push(`<div class="final-media-thumb" title="Главное изображение"><img src="${media.main}" alt="Главное изображение"></div>`);
        media.extra.forEach((src) => items.push(`<div class="final-media-thumb" title="Дополнительное изображение"><img src="${src}" alt="Дополнительное изображение"></div>`));
        if (media.video) items.push(`<div class="final-media-thumb" title="Видео"><video src="${media.video}" muted></video></div>`);
        if (media.poster) items.push(`<div class="final-media-thumb" title="Постер видео"><img src="${media.poster}" alt="Постер видео"></div>`);
        if (!items.length) return `<div class="final-muted">Медиа не добавлены.</div>`;
        return `<div class="final-media-grid">${items.join("")}</div>`;
      }

      function updateFinalReview() {
        const container = document.getElementById("finalReview");
        if (!container) return false;
        const descriptionEl = document.getElementById("rteBody");
        const skus = finalSkuRows();
        syncBadgeSelectionWithDiscount(skus);
        const data = {
          name: document.getElementById("productName")?.value.trim() || "",
          category: finalSelectText("categorySelect"),
          brand: finalSelectText("brandSelect"),
          status: finalSelectText("statusSelect"),
          badges: finalGetBadges(skus),
          likesAdjustment: normalizeLikesAdjustment(document.getElementById("productLikesAdjustment")?.value),
          descriptionHtml: sanitizeRteHtml(descriptionEl?.innerHTML || ""),
          descriptionText: descriptionEl?.innerText.trim() || "",
          chars: finalGetCharacteristics(),
          media: finalGetMedia(),
          groups: skuTreeGetGroups(),
          skus,
        };
        const problems = finalReadiness(data);
        const publishBtn = document.getElementById("publishBtn");
        if (publishBtn) publishBtn.disabled = problems.length > 0;

        const badgesText = data.badges.length ? data.badges.join(", ") : "Не выбраны";
        const charsHtml = data.chars.length
          ? `<div class="final-list">${data.chars.map((item) => `<div class="final-line"><span class="final-key">${finalEscape(item.key || "Характеристика")}</span><span class="final-value">${finalEscape(item.value || "—")}</span></div>`).join("")}</div>`
          : `<div class="final-muted">Характеристики не добавлены.</div>`;
        const variantsHtml = data.groups.length
          ? `<div class="final-list">${data.groups.map((group) => `<div class="final-line"><span class="final-key">${finalEscape(group.name)}</span><span class="final-value">${finalEscape(group.values.map((value) => value.name).join(", ") || "Нет значений")}</span></div>`).join("")}</div>`
          : `<div class="final-muted">Группы вариантов не созданы.</div>`;
        const readyHtml = problems.length
          ? `<div class="final-ready"><div class="final-ready-title">Нужно исправить</div><ul class="final-problems">${problems.map((problem) => `<li>${finalEscape(problem)}</li>`).join("")}</ul></div>`
          : `<div class="final-ready ok"><div class="final-ready-title">Товар готов к публикации</div><div class="final-muted">Все обязательные данные заполнены.</div></div>`;

        container.innerHTML = `
          <section class="final-section">
            <div class="final-section-title">Основная информация</div>
            <div class="final-list">
              <div class="final-line"><span class="final-key">Название</span><span class="final-value">${finalEscape(data.name || "Не указано")}</span></div>
              <div class="final-line"><span class="final-key">Категория</span><span class="final-value">${finalEscape(data.category || "Не выбрана")}</span></div>
              <div class="final-line"><span class="final-key">Бренд</span><span class="final-value">${finalEscape(data.brand || "Не выбран")}</span></div>
              <div class="final-line"><span class="final-key">Статус</span><span class="final-value">${finalEscape(data.status || "Не указан")}</span></div>
              <div class="final-line"><span class="final-key">Бейджи</span><span class="final-value">${finalEscape(badgesText)}</span></div>
              <div class="final-line"><span class="final-key">Лайки</span><span class="final-value">${Math.max(0, Number(skuEditProduct?.likesReal || 0) + data.likesAdjustment)} итог (${data.likesAdjustment >= 0 ? "+" : ""}${data.likesAdjustment} вручную)</span></div>
            </div>
          </section>
          <section class="final-section">
            <div class="final-section-title">Описание</div>
            <div class="final-description">${data.descriptionHtml || ""}</div>
            <div class="final-subtitle">Характеристики</div>
            ${charsHtml}
          </section>
          <section class="final-section">
            <div class="final-section-title">Медиа</div>
            ${finalBuildMedia(data.media)}
          </section>
          <section class="final-section">
            <div class="final-section-title">Варианты</div>
            ${variantsHtml}
          </section>
          <section class="final-section">
            <div class="final-section-title">Матрица цен</div>
            ${finalBuildPriceTable(data.groups, data.skus)}
          </section>
          <section class="final-section">
            <div class="final-section-title">Проверка готовности</div>
            ${readyHtml}
          </section>`;
        return problems.length === 0;
      }

      function collectSkuAdminPayload() {
        const descriptionEl = document.getElementById("rteBody");
        const skus = finalSkuRows();
        const hasForcedSale = syncBadgeSelectionWithDiscount(skus);
        return {
          name: document.getElementById("productName")?.value.trim() || "",
          category: document.getElementById("categorySelect")?.value || "",
          brand: document.getElementById("brandSelect")?.value || "",
          status: document.getElementById("statusSelect")?.value || "published",
          likesAdjustment: normalizeLikesAdjustment(document.getElementById("productLikesAdjustment")?.value),
          badgeCodes: hasForcedSale ? [] : Array.from(document.querySelectorAll("#badgeGroup .badge-opt.selected")).map((btn) => btn.dataset.badge).filter(Boolean),
          descriptionHtml: sanitizeRteHtml(descriptionEl?.innerHTML || ""),
          descriptionText: descriptionEl?.innerText.trim() || "",
          chars: finalGetCharacteristics(),
          groups: skuTreeGetGroups(),
          rootPricing: finalRootPricing(),
          skus,
        };
      }

      function buildSkuAdminFormData(payload) {
        const formData = new FormData();
        formData.append("payload", JSON.stringify(payload));
        if (skuUploadState.mainImage) formData.append("image", skuUploadState.mainImage);
        skuUploadState.extraImages.filter(Boolean).forEach((file) => formData.append("extra_images", file));
        if (skuUploadState.promoVideo) formData.append("promo_video", skuUploadState.promoVideo);
        if (skuUploadState.promoVideoPoster) formData.append("promo_video_poster", skuUploadState.promoVideoPoster);

        variantGroups.forEach((group) => {
          group.variants.forEach((variant) => {
            if (variant.imageFile) {
              formData.append(`variant_image__${group.id}__${variant.id}`, variant.imageFile);
            }
          });
        });
        return formData;
      }

      function showSkuAdminMessage(message, isError = false) {
        let box = document.getElementById("skuAdminMessage");
        if (!box) {
          box = document.createElement("div");
          box.id = "skuAdminMessage";
          box.style.position = "fixed";
          box.style.right = "24px";
          box.style.bottom = "24px";
          box.style.zIndex = "1000";
          box.style.maxWidth = "420px";
          box.style.padding = "14px 16px";
          box.style.borderRadius = "10px";
          box.style.fontWeight = "700";
          box.style.boxShadow = "0 14px 40px rgba(0,0,0,.45)";
          document.body.appendChild(box);
        }
        box.textContent = message;
        box.style.border = isError ? "1px solid rgba(239,68,68,.45)" : "1px solid rgba(34,197,94,.35)";
        box.style.background = isError ? "rgba(127,29,29,.92)" : "rgba(20,83,45,.92)";
        box.style.color = "#fff";
        window.clearTimeout(box._hideTimer);
        box._hideTimer = window.setTimeout(() => box.remove(), 5000);
      }

      // ── PUBLISH ────────────────────────────────────
      async function publish(event) {
        const btn = event.target.closest("button") || event.currentTarget;
        if (!updateFinalReview()) return;
        const originalHtml = btn.innerHTML;
        const payload = collectSkuAdminPayload();
        btn.textContent = "Сохранение...";
        btn.disabled = true;

        try {
          const response = await fetch(skuAdminSaveUrl, {
            method: "POST",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "X-Requested-With": "XMLHttpRequest",
            },
            body: buildSkuAdminFormData(payload),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.message || "Не удалось сохранить товар.");
          }
          clearSkuAdminState();
          window.location.href = result.redirect_url || skuAdminProductListUrl;
        } catch (error) {
          showSkuAdminMessage(error.message || "Не удалось сохранить товар.", true);
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }
      }
