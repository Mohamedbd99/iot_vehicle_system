// settings.js - Theme switching functionality
// Initialize theme on page load
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    updateActiveOption(savedTheme);
}

function applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', theme);
    }

    localStorage.setItem('theme', theme);
}

function updateActiveOption(theme) {
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.theme === theme) {
            option.classList.add('active');
        }
    });
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Theme option click handlers
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            applyTheme(theme);
            updateActiveOption(theme);
        });
    });

    // Initialize theme and update active option
    initTheme();

    // Update current time display
    const updateTime = () => {
        const now = new Date();
        const timeElement = document.getElementById('currentDateTime');
        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString();
        }
    };
    updateTime();
    setInterval(updateTime, 1000);
});

// Listen for system theme changes (can be set up immediately)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'system') {
        applyTheme('system');
    }
});
