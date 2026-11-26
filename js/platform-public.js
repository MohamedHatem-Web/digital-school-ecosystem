(() => {
  const button = document.querySelector('[data-platform-theme-toggle]');
  if (!button) return;

  const storageKey = 'dse_theme';
  const icon = {
    dark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>',
    light: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
  };

  const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      console.warn('Platform theme preference could not be saved:', error);
    }
    button.innerHTML = `<span class="theme-icon-badge">${icon[theme]}</span>`;
    button.title = theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';
    button.setAttribute('aria-label', button.title);
  };

  const savedTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  setTheme(savedTheme);
  button.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
})();
