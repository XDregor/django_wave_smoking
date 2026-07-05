(function () {
    "use strict";

    const root = document.querySelector(".wa-admin-home[data-visits-url]");
    if (!root) return;

    const chart = root.querySelector("[data-traffic-chart]");
    const svg = root.querySelector("[data-traffic-svg]");
    const axis = root.querySelector("[data-traffic-axis]");
    const tooltip = root.querySelector("[data-traffic-tooltip]");
    const todayValue = root.querySelector("[data-traffic-today]");
    const updatedValue = root.querySelector("[data-traffic-updated]");
    const endpoint = root.dataset.visitsUrl;
    if (!chart || !svg || !axis || !tooltip || !endpoint) return;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const numberFormat = new Intl.NumberFormat("ru-RU");
    let lastUpdatedAt = 0;
    let latestPoints = [];
    let resizeFrame = 0;

    function svgElement(name, attributes) {
        const element = document.createElementNS(svgNamespace, name);
        Object.entries(attributes || {}).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
        });
        return element;
    }

    function formatVisitors(value) {
        return numberFormat.format(Number(value) || 0);
    }

    function renderMetrics(data) {
        if (todayValue) todayValue.textContent = formatVisitors(data.today);
        if (updatedValue) updatedValue.textContent = `Обновлено в ${data.updated_at}`;
    }

    function showTooltip(point, x, y, chartWidth, chartHeight) {
        tooltip.replaceChildren();
        const count = document.createElement("strong");
        count.textContent = formatVisitors(point.value);
        const date = document.createElement("span");
        date.textContent = `${point.label} · посетителей`;
        tooltip.append(count, date);
        tooltip.style.top = `${(y / chartHeight) * 100}%`;
        tooltip.hidden = false;

        const stageWidth = tooltip.parentElement.clientWidth;
        const desiredLeft = (x / chartWidth) * stageWidth;
        const horizontalInset = tooltip.offsetWidth / 2 + 6;
        const clampedLeft = Math.min(
            stageWidth - horizontalInset,
            Math.max(horizontalInset, desiredLeft),
        );
        tooltip.style.left = `${clampedLeft}px`;
    }

    function renderChart(points) {
        svg.replaceChildren();
        axis.replaceChildren();
        tooltip.hidden = true;

        const width = Math.max(320, Math.round(svg.clientWidth));
        const height = Math.max(150, Math.round(svg.clientHeight));
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const left = 36;
        const right = 12;
        const top = 14;
        const bottom = 18;
        const plotWidth = width - left - right;
        const plotHeight = height - top - bottom;
        const baseline = top + plotHeight;
        const maxValue = Math.max(1, ...points.map((point) => Number(point.value) || 0));
        const roundedMax = Math.max(4, Math.ceil(maxValue / 4) * 4);
        const hasVisits = points.some((point) => Number(point.value) > 0);

        for (let index = 0; index <= 4; index += 1) {
            const y = top + (plotHeight / 4) * index;
            const value = Math.round(roundedMax * (1 - index / 4));
            svg.appendChild(svgElement("line", {
                class: "traffic-grid-line",
                x1: left,
                x2: width - right,
                y1: y,
                y2: y,
            }));
            const label = svgElement("text", {
                class: "traffic-grid-label",
                x: 0,
                y: y + 3,
            });
            label.textContent = formatVisitors(value);
            svg.appendChild(label);
        }

        const coordinates = points.map((point, index) => {
            const x = points.length === 1
                ? left + plotWidth / 2
                : left + (plotWidth * index) / (points.length - 1);
            const y = top + plotHeight * (1 - (Number(point.value) || 0) / roundedMax);
            return { point, x, y };
        });

        if (coordinates.length && hasVisits) {
            const lineCommands = coordinates.map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`).join(" ");
            const lastCoordinate = coordinates[coordinates.length - 1];
            const areaCommands = `${lineCommands} L${lastCoordinate.x},${baseline} L${coordinates[0].x},${baseline} Z`;
            svg.appendChild(svgElement("path", { class: "traffic-area", d: areaCommands }));
            const line = svgElement("path", { class: "traffic-line", d: lineCommands });
            svg.appendChild(line);
        } else if (coordinates.length) {
            svg.appendChild(svgElement("line", {
                class: "traffic-empty-line",
                x1: left,
                x2: width - right,
                y1: baseline,
                y2: baseline,
            }));
            const emptyLabel = svgElement("text", {
                class: "traffic-empty-label",
                x: width / 2,
                y: top + plotHeight / 2,
                "text-anchor": "middle",
            });
            emptyLabel.textContent = "Данные появятся после посещений";
            svg.appendChild(emptyLabel);
        }

        coordinates.forEach(({ point, x, y }, index) => {
            if (!hasVisits) return;
            const pointNode = svgElement("circle", {
                class: "traffic-point",
                cx: x,
                cy: y,
                r: index === coordinates.length - 1 ? 4 : 3,
                tabindex: 0,
                role: "button",
                "aria-label": `${point.label}: ${formatVisitors(point.value)} посетителей`,
            });
            const reveal = () => showTooltip(point, x, y, width, height);
            pointNode.addEventListener("mouseenter", reveal);
            pointNode.addEventListener("focus", reveal);
            pointNode.addEventListener("mouseleave", () => { tooltip.hidden = true; });
            pointNode.addEventListener("blur", () => { tooltip.hidden = true; });
            svg.appendChild(pointNode);
        });

        const axisIndexes = points.length <= 7
            ? points.map((point, index) => index)
            : [0, 2, 4, 6, 8, 10, points.length - 1];
        axisIndexes.forEach((index) => {
            const point = points[index];
            const label = document.createElement("span");
            label.textContent = point.label;
            axis.appendChild(label);
        });

    }

    async function loadVisits() {
        chart.classList.add("is-updating");
        try {
            const response = await fetch(endpoint, {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentType = response.headers.get("Content-Type") || "";
            if (!contentType.includes("application/json")) {
                if (updatedValue) updatedValue.textContent = "Сессия истекла";
                window.setTimeout(() => window.location.reload(), 500);
                return;
            }
            const data = await response.json();
            renderMetrics(data);
            latestPoints = Array.isArray(data.points) ? data.points : [];
            renderChart(latestPoints);
            chart.setAttribute("aria-busy", "false");
            lastUpdatedAt = Date.now();
        } catch (error) {
            if (updatedValue) updatedValue.textContent = "Не удалось обновить данные";
            chart.setAttribute("aria-busy", "false");
            console.error("Dashboard visits update failed:", error);
        } finally {
            chart.classList.remove("is-updating");
        }
    }

    loadVisits();
    window.setInterval(loadVisits, 60000);
    if ("ResizeObserver" in window) {
        const resizeObserver = new ResizeObserver(() => {
            if (!latestPoints.length) return;
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => renderChart(latestPoints));
        });
        resizeObserver.observe(chart);
    }
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && Date.now() - lastUpdatedAt > 60000) loadVisits();
    });
})();
