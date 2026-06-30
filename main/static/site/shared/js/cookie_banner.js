(() => {
    const banner = document.getElementById("cookie");
    const closeButton = document.getElementById("cclose");
    const acceptedKey = "cookieConsentAccepted";
    const dateKey = "cookieConsentDate";
    const maxAge = 30 * 24 * 60 * 60 * 1000;

    if (!banner || !closeButton) return;

    function getStoredConsent() {
      try {
        return {
          accepted: localStorage.getItem(acceptedKey) === "true",
          date: Number(localStorage.getItem(dateKey) || 0),
        };
      } catch (_) {
        const accepted = document.cookie.includes(`${acceptedKey}=true`);
        const match = document.cookie.match(new RegExp(`${dateKey}=([^;]+)`));
        return {
          accepted,
          date: Number(match?.[1] || 0),
        };
      }
    }

    function storeConsent() {
      const timestamp = Date.now();
      try {
        localStorage.setItem(acceptedKey, "true");
        localStorage.setItem(dateKey, `${timestamp}`);
      } catch (_) {
        const expires = new Date(timestamp + maxAge).toUTCString();
        document.cookie = `${acceptedKey}=true; expires=${expires}; path=/; SameSite=Lax`;
        document.cookie = `${dateKey}=${timestamp}; expires=${expires}; path=/; SameSite=Lax`;
      }
    }

    function shouldShowConsent() {
      const consent = getStoredConsent();
      return !consent.accepted || !consent.date || Date.now() - consent.date > maxAge;
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
