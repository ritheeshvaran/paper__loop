const { createProxyMiddleware } = require("http-proxy-middleware");

/** Dev-only: proxy /api to FastAPI so the frontend works when the backend restarts. */
module.exports = function setupProxy(app) {
  const target =
    process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_DEV_PROXY_URL;
  if (!target) {
    throw new Error(
      "Dev proxy target missing. Set REACT_APP_DEV_PROXY_URL (or REACT_APP_BACKEND_URL) in frontend/.env",
    );
  }
  app.use(
    "/api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
    }),
  );
};
