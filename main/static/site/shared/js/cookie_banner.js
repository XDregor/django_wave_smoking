(() => {
    const banner = document.getElementById("cookie");
    const closeButton = document.getElementById("cclose");
    const acceptedKey = "cookieConsentAccepted";
    const dateKey = "cookieConsentDate";
    const dayKey = "cookieConsentDay";
    const fallbackCookieLifetime = 365 * 24 * 60 * 60 * 1000;

    if (!banner || !closeButton) return;

    function getLocalDay(timestamp = Date.now()) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function getStoredConsent() {
      try {
        return {
          accepted: localStorage.getItem(acceptedKey) === "true",
          date: Number(localStorage.getItem(dateKey) || 0),
          day: localStorage.getItem(dayKey) || "",
        };
      } catch (_) {
        const accepted = document.cookie.includes(`${acceptedKey}=true`);
        const dateMatch = document.cookie.match(new RegExp(`${dateKey}=([^;]+)`));
        const dayMatch = document.cookie.match(new RegExp(`${dayKey}=([^;]+)`));
        return {
          accepted,
          date: Number(dateMatch?.[1] || 0),
          day: dayMatch?.[1] || "",
        };
      }
    }

    function storeConsent() {
      const timestamp = Date.now();
      try {
        localStorage.setItem(acceptedKey, "true");
        localStorage.setItem(dateKey, `${timestamp}`);
        localStorage.setItem(dayKey, getLocalDay(timestamp));
      } catch (_) {
        const expires = new Date(timestamp + fallbackCookieLifetime).toUTCString();
        document.cookie = `${acceptedKey}=true; expires=${expires}; path=/; SameSite=Lax`;
        document.cookie = `${dateKey}=${timestamp}; expires=${expires}; path=/; SameSite=Lax`;
        document.cookie = `${dayKey}=${getLocalDay(timestamp)}; expires=${expires}; path=/; SameSite=Lax`;
      }
    }

    function shouldShowConsent() {
      const consent = getStoredConsent();
      if (!consent.accepted || !consent.date) return true;
      const acceptedDay = consent.day || getLocalDay(consent.date);
      return acceptedDay !== getLocalDay();
    }

    function showBanner() {
      banner.classList.add("active");
      requestAnimationFrame(() => banner.classList.add("visible"));
    }

    function hideBanner() {
      storeConsent();
      banner.classList.remove("visible");
      window.setTimeout(() => {
        banner.classList.remove("active");
      }, 260);
    }

    closeButton.addEventListener("click", hideBanner);

    if (shouldShowConsent()) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showBanner, { once: true });
      } else {
        showBanner();
      }
    }
  })();
