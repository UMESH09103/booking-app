document.addEventListener("DOMContentLoaded", function() {
    // Get DOM elements with error checking
    const langSelect = document.getElementById("languageSelect");
    const themeToggle = document.getElementById("themeToggle");

    // Log elements for debugging
    console.log("Language script loaded");
    console.log("Language select:", langSelect);
    console.log("Theme toggle:", themeToggle);

    // Exit if language selector is missing
    if (!langSelect) {
        console.error("Language select (#languageSelect) not found in the DOM");
        return;
    }

    // Get current language and theme from cookies or default
    const getCookieValue = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            const cookieValue = parts.pop().split(';').shift();
            console.log(`Cookie ${name}:`, cookieValue);
            return cookieValue;
        }
        console.log(`Cookie ${name} not found, defaulting to 'en' or 'dark'`);
        return null;
    };

    const currentLang = getCookieValue("lang") || "en";
    const currentTheme = getCookieValue("theme") || "dark";

    // Set initial values with logging
    langSelect.value = currentLang;
    console.log("Initial language:", currentLang);

    if (themeToggle) {
        themeToggle.checked = currentTheme === "light";
        if (currentTheme === "light") {
            document.body.classList.add("light-mode");
        }
        console.log("Initial theme:", currentTheme);
    } else {
        console.error("Theme toggle (#themeToggle) not found in the DOM");
    }

    // Language change handler with forced refresh
    langSelect.addEventListener("change", function() {
        const newLang = this.value;
        console.log("Changing language to:", newLang);
        setCookie("lang", newLang, 30); // 30 days expiration
        loadTranslations(newLang)
            .then(() => {
                console.log("Language loaded successfully, forcing page refresh");
                window.location.reload(); // Force refresh to update all content
            })
            .catch(err => console.error("Failed to load translations:", err));
    });

    // Theme toggle handler with forced refresh
    if (themeToggle) {
        themeToggle.addEventListener("change", function() {
            const newTheme = this.checked ? "light" : "dark";
            console.log("Changing theme to:", newTheme);
            setCookie("theme", newTheme, 30); // 30 days expiration
            document.body.classList.toggle("light-mode", newTheme === "light");
            window.location.reload(); // Force refresh to ensure consistent styling
        });
    }

    // Load initial translations with fallback
    loadTranslations(currentLang)
        .then(() => console.log("Initial translations loaded for:", currentLang))
        .catch(err => console.error("Initial translation load failed:", err));

    // Search functionality (unchanged, included for completeness)
    const searchInput = document.getElementById("searchInput");
    const djCards = document.querySelectorAll(".dj-card");

    if (searchInput && djCards) {
        searchInput.addEventListener("input", function() {
            const searchTerm = searchInput.value.toLowerCase().trim();
            console.log("Searching for:", searchTerm);

            djCards.forEach(card => {
                const djName = card.querySelector("h3")?.textContent.toLowerCase() || "";
                if (djName.includes(searchTerm)) {
                    card.style.display = "block";
                } else {
                    card.style.display = "none";
                }
            });
        });
    }

    // Utility functions
    function setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
        console.log(`Set cookie ${name} to ${value} for ${days} days`);
    }

    async function loadTranslations(lang) {
        try {
            const response = await fetch(`/lang/${lang}.json`, {
                headers: { "Cache-Control": "no-cache" } // Prevent caching issues
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
            }
            const translations = await response.json();
            document.querySelectorAll("[data-i18n]").forEach(element => {
                const key = element.getAttribute("data-i18n");
                if (translations[key]) {
                    element.textContent = formatString(translations[key], element.dataset);
                } else {
                    console.warn(`Translation key "${key}" not found in ${lang}.json, using key as fallback`);
                    element.textContent = key; // Fallback to key name
                }
            });
            return translations;
        } catch (err) {
            console.error("Translation Error:", err);
            throw err; // Re-throw for promise chain
        }
    }

    function formatString(str, data) {
        return str.replace(/\{([^}]+)\}/g, (match, key) => data[key] || match);
    }
});