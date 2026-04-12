(() => {
  const fallbackConfig = {
    apiBaseUrl: '',
    socketUrl: '',
    appName: 'MeetRecap',
  };

  let configPromise;

  window.getAppConfig = async function getAppConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/app-config', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({}))
        .then((config) => ({
          apiBaseUrl: typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl : fallbackConfig.apiBaseUrl,
          socketUrl: typeof config.socketUrl === 'string' ? config.socketUrl : fallbackConfig.socketUrl,
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