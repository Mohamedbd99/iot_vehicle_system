// theme-init.js - Initialize theme on all pages (run before page renders)
(function () {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const root = document.documentElement;

    if (savedTheme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', savedTheme);
    }
})();
