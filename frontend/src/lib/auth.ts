const TOKEN_STORAGE_KEY = "assessment-platform-auth-token";
const AUTH_EVENT_NAME = "assessment-platform-auth-changed";

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new Event(AUTH_EVENT_NAME));
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT_NAME));
}

export function subscribeToAuthChanges(callback: () => void) {
  window.addEventListener(AUTH_EVENT_NAME, callback);
  return () => window.removeEventListener(AUTH_EVENT_NAME, callback);
}
