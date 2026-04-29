export const frontendBuildInfo = {
  version: __APP_VERSION__,
  commit: __APP_GIT_SHA__ === "unknown" ? null : __APP_GIT_SHA__,
  builtAt: __APP_BUILD_TIME__ || null,
  environment: __APP_DEPLOY_ENV__
};
