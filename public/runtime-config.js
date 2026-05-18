(() => {
  const fallbackConfig = {
    apiBaseUrl: '',
    socketUrl: '',
    appName: 'MeetRecap',
  };

  let configPromise;

  function sanitizeOriginUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    try {
      const url = new URL(raw, window.location.origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return '';
      }

      // Avoid mixed-content failures in installed HTTPS PWA contexts.
      if (window.location.protocol === 'https:' && url.protocol === 'http:') {
        const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
        if (!localHost) {
          return '';
        }
      }

      return `${url.origin}/`;
    } catch {
      return '';
    }
  }

  window.getAppConfig = async function getAppConfig() {
    if (!configPromise) {
      const cacheBuster = Date.now();
      configPromise = fetch(`/api/app-config?ts=${cacheBuster}`, { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({}))
        .then((config) => ({
          apiBaseUrl: sanitizeOriginUrl(typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl : fallbackConfig.apiBaseUrl),
          socketUrl: sanitizeOriginUrl(typeof config.socketUrl === 'string' ? config.socketUrl : fallbackConfig.socketUrl),
          appName: typeof config.appName === 'string' ? config.appName : fallbackConfig.appName,
        }));
    }

    return configPromise;
  };

  window.getApiBaseUrl = async function getApiBaseUrl() {
    const config = await window.getAppConfig();
    return config.apiBaseUrl || '';
  };

  window.getSocketUrl = async function getSocketUrl() {
    const config = await window.getAppConfig();
    return config.socketUrl || '';
  };
})();