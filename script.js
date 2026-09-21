"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const navbar = document.querySelector("[data-navbar]");
    const menu = document.querySelector("[data-menu]");
    const menuToggle = document.querySelector("[data-menu-toggle]");
    const navigationLinks = Array.from(document.querySelectorAll(".nav-link"));
    const isSlovak = document.documentElement.lang === "sk";
    const appsMenu = document.querySelector("[data-apps-menu]");
    const appsList = document.querySelector("[data-apps-list]");

    if (appsMenu && appsList) {
        // The public registry is filtered by the owner's publication settings.
        // A launch still passes through the app's normal server-side auth gate.
        fetch("/api/account/catalog", { credentials: "omit", cache: "no-store", redirect: "error", headers: { Accept: "application/json" } })
            .then(response => { if (!response.ok) throw new Error("catalog unavailable"); return response.json(); })
            .then(({ apps }) => {
                if (!Array.isArray(apps)) return;
                const entries = [];
                for (const app of apps) {
                    let launch;
                    try { launch = new URL(app.launchUrl); } catch { continue; }
                    if (launch.protocol !== "https:" || launch.username || launch.password) continue;
                    const item = document.createElement("a");
                    item.href = launch.href;
                    const fallback = document.createElement("span");
                    fallback.className = "app-thumbnail";
                    fallback.textContent = String(app.name || "?").trim().split(/\s+/u).slice(0, 2).map(part => [...part][0] || "").join("");
                    fallback.setAttribute("aria-hidden", "true");
                    let icon;
                    try { icon = new URL(app.icon, location.origin); } catch { /* use initials */ }
                    if (icon?.origin === location.origin && /^\/assets\/projects\/[a-z0-9.-]+\.(svg|webp|png)$/.test(icon.pathname) && !icon.search && !icon.hash) {
                        const image = document.createElement("img");
                        image.className = "app-thumbnail"; image.src = icon.href; image.alt = "";
                        image.width = 36; image.height = 36; image.referrerPolicy = "no-referrer";
                        image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
                        item.append(image);
                    } else item.append(fallback);
                    const name = document.createElement("span"); name.textContent = app.name; item.append(name);
                    entries.push(item);
                }
                const all = document.createElement("a"); all.href = "/apps"; all.className = "all-apps";
                all.textContent = isSlovak ? "Všetky aplikácie" : "All apps";
                appsList.replaceChildren(...entries, all);
            }).catch(() => { /* Keep the server-rendered picker link usable. */ });
        appsMenu.addEventListener("keydown", event => {
            if (event.key === "Escape") { event.stopPropagation(); appsMenu.open = false; appsMenu.querySelector("summary").focus(); }
        });
        document.addEventListener("click", event => { if (!appsMenu.contains(event.target)) appsMenu.open = false; });
    }

    const updateNavbar = () => {
        navbar?.classList.toggle("scrolled", window.scrollY > 12);
    };

    const closeMenu = () => {
        if (!menu || !menuToggle) return;
        menu.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", isSlovak ? "Otvoriť navigáciu" : "Open navigation");
        document.body.classList.remove("menu-open");
    };

    const openMenu = () => {
        if (!menu || !menuToggle) return;
        menu.classList.add("open");
        menuToggle.setAttribute("aria-expanded", "true");
        menuToggle.setAttribute("aria-label", isSlovak ? "Zavrieť navigáciu" : "Close navigation");
        document.body.classList.add("menu-open");
    };

    menuToggle?.addEventListener("click", () => {
        const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
        if (isOpen) closeMenu();
        else openMenu();
    });

    menu?.addEventListener("click", (event) => {
        if (event.target instanceof HTMLAnchorElement) closeMenu();
    });

    document.addEventListener("click", (event) => {
        if (!menu || !menuToggle || !(event.target instanceof Node)) return;
        if (!menu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
            menuToggle?.focus();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) closeMenu();
    });

    window.addEventListener("scroll", updateNavbar, { passive: true });
    updateNavbar();

    const sections = navigationLinks
        .map((link) => {
            const target = link.getAttribute("href");
            if (!target?.startsWith("#")) return null;
            return document.querySelector(target);
        })
        .filter((section) => section instanceof HTMLElement);

    if ("IntersectionObserver" in window && sections.length > 0) {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (!visible?.target.id) return;

                navigationLinks.forEach((link) => {
                    const isActive = link.getAttribute("href") === `#${visible.target.id}`;
                    link.classList.toggle("active", isActive);
                    if (isActive) link.setAttribute("aria-current", "location");
                    else link.removeAttribute("aria-current");
                });
            },
            { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.1, 0.4] }
        );

        sections.forEach((section) => observer.observe(section));
    }

    // Scroll reveal — progressive enhancement only.
    // CSS hides these elements solely while the `js` class is present.
    const revealTargets = Array.from(
        document.querySelectorAll(
            [
                ".hero-content",
                ".hero-visual",
                ".feature-card",
                ".feature-list li",
                ".project-card",
                ".howto-step",
                ".pricing-card",
                ".faq-item",
                ".contact-info",
                ".contact-cta"
            ].join(", ")
        )
    );

    revealTargets.forEach((element) => element.classList.add("reveal-target"));

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
        revealTargets.forEach((element) => element.classList.add("animate-in"));
    } else {
        const revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("animate-in");
                    revealObserver.unobserve(entry.target);
                });
            },
            { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
        );

        revealTargets.forEach((element) => revealObserver.observe(element));
    }
});
