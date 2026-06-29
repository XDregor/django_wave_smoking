(function () {
    "use strict";

    function initLogin() {
        const form = document.getElementById("login-form");
        const password = form?.querySelector('input[name="password"]');
        const passwordToggle = form?.querySelector("[data-password-toggle]");
        const submit = form?.querySelector("[data-login-submit]");
        const submitText = submit?.querySelector("[data-login-submit-text]");

        if (passwordToggle && password) {
            passwordToggle.addEventListener("click", function () {
                const reveal = password.type === "password";
                password.type = reveal ? "text" : "password";
                passwordToggle.setAttribute("aria-pressed", String(reveal));
                passwordToggle.setAttribute("aria-label", reveal ? "Скрыть пароль" : "Показать пароль");

                const icon = passwordToggle.querySelector(".material-symbols-outlined");
                if (icon) icon.textContent = reveal ? "visibility_off" : "visibility";
                password.focus({ preventScroll: true });
            });
        }

        if (form && submit) {
            form.addEventListener("submit", function () {
                if (!form.checkValidity()) return;
                submit.disabled = true;
                submit.classList.add("is-loading");
                submit.setAttribute("aria-busy", "true");
                if (submitText) submitText.textContent = "Вход...";
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initLogin, { once: true });
    } else {
        initLogin();
    }
})();
