(function () {
    "use strict";

    function initLogin() {
        const form = document.getElementById("login-form");
        const password = form?.querySelector('input[name="password"]');
        const passwordToggle = form?.querySelector("[data-password-toggle]");
        const submit = form?.querySelector("[data-login-submit]");
        const submitText = submit?.querySelector("[data-login-submit-text]");
        const visual = document.querySelector(".wave-login-visual");
        const visualProduct = visual?.querySelector("[data-login-visual]");
        const ambientLights = visual?.querySelectorAll("[data-login-light]") || [];
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

        if (visual && visualProduct && !reducedMotion && window.matchMedia("(pointer: fine)").matches) {
            visual.addEventListener("pointermove", function (event) {
                const bounds = visual.getBoundingClientRect();
                const x = (event.clientX - bounds.left) / bounds.width - 0.5;
                const y = (event.clientY - bounds.top) / bounds.height - 0.5;
                visualProduct.style.transform = `translate(calc(-50% + ${x * 14}px), calc(-50% + ${y * 10}px)) rotate(${x * 1.2}deg)`;
            });

            visual.addEventListener("pointerleave", function () {
                visualProduct.style.transform = "translate(-50%, -50%)";
            });
        }

        if (visual && ambientLights.length && !reducedMotion) {
            const lightTimers = new Set();

            const moveLight = function (light, index) {
                const bounds = visual.getBoundingClientRect();
                const duration = 7000 + Math.random() * 6000;
                const x = (Math.random() - 0.5) * bounds.width * 0.68;
                const y = (Math.random() - 0.5) * bounds.height * 0.58;
                const scale = 0.82 + Math.random() * 0.42;
                const baseOpacity = index === 1 ? 0.055 : 0.095;
                const opacity = baseOpacity + Math.random() * 0.055;

                light.style.transitionDuration = `${duration}ms`;
                light.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${scale})`;
                light.style.opacity = String(opacity);

                const timer = window.setTimeout(function () {
                    lightTimers.delete(timer);
                    moveLight(light, index);
                }, duration * 0.9);
                lightTimers.add(timer);
            };

            requestAnimationFrame(function () {
                ambientLights.forEach(function (light, index) {
                    const timer = window.setTimeout(function () {
                        lightTimers.delete(timer);
                        moveLight(light, index);
                    }, index * 750);
                    lightTimers.add(timer);
                });
            });

            window.addEventListener("pagehide", function () {
                lightTimers.forEach(function (timer) {
                    window.clearTimeout(timer);
                });
                lightTimers.clear();
            }, { once: true });
        }

        if (form && submit) {
            form.addEventListener("submit", function () {
                if (!form.checkValidity()) return;
                submit.disabled = true;
                submit.classList.add("is-loading");
                submit.setAttribute("aria-busy", "true");
                if (submitText) submitText.textContent = "Выполняется вход";
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initLogin, { once: true });
    } else {
        initLogin();
    }
})();
