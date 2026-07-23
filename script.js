"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const navbar = document.querySelector("[data-navbar]");
    const menu = document.querySelector("[data-menu]");
    const menuToggle = document.querySelector("[data-menu-toggle]");
    const navigationLinks = Array.from(document.querySelectorAll(".nav-link"));
    const isSlovak = document.documentElement.lang === "sk";

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
});
