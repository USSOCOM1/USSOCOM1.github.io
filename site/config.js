// Where the members-only Worker lives. Set after `wrangler deploy`.
window.USSOCOM_CONFIG = {
  workerUrl: ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8787' : '',
  dataUrl: 'data/public.json',
};
