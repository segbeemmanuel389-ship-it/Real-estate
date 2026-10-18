(() => {
  const config = window.PACIFIC_SUPABASE_CONFIG;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    window.PACIFIC_SUPABASE_CLIENT = null;
    return;
  }
  if (!config?.url || !config.anonKey) {
    window.PACIFIC_SUPABASE_CLIENT = null;
    return;
  }
  window.PACIFIC_SUPABASE_CLIENT = window.supabase.createClient(config.url, config.anonKey);
})();
