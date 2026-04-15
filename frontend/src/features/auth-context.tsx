import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { clearAuthToken, getAuthToken, setAuthToken, subscribeToAuthChanges } from "@/lib/auth";
import type { UserRole } from "@/types";

type AuthUser = {
  id: string;
  displayName: string;
  username: string;
  role: UserRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  activateAccount: (token: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthResponse = {
  token: string;
  user: AuthUser;
  mustChangePassword?: boolean;
  sessionExpiresAt: string;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const token = getAuthToken();
      if (!token) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await api.get<{ user: AuthUser }>("/auth/me");
        if (isMounted) {
          setUser(response.user);
        }
      } catch {
        clearAuthToken();
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(
    () =>
      subscribeToAuthChanges(() => {
        const token = getAuthToken();
        if (!token) {
          setUser(null);
          setMustChangePassword(false);
        }
      }),
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      mustChangePassword,
      login: async (username, password) => {
        const response = await api.post<AuthResponse>("/auth/login", { username, password });
        setAuthToken(response.token);
        setUser(response.user);
        setMustChangePassword(Boolean(response.mustChangePassword));
      },
      logout: async () => {
        try {
          await api.post("/auth/logout");
        } finally {
          clearAuthToken();
          setUser(null);
          setMustChangePassword(false);
        }
      },
      changePassword: async (currentPassword, newPassword) => {
        const response = await api.post<AuthResponse>("/auth/change-password", {
          currentPassword,
          newPassword
        });
        setAuthToken(response.token);
        setUser(response.user);
        setMustChangePassword(false);
      },
      activateAccount: async (token, newPassword) => {
        const response = await api.post<AuthResponse>("/auth/activate-account", {
          token,
          newPassword
        });
        setAuthToken(response.token);
        setUser(response.user);
        setMustChangePassword(false);
      }
    }),
    [isLoading, mustChangePassword, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
