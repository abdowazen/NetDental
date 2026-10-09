import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { User, Language, DefaultPage } from "@clinic/shared";
import { api, ApiError } from "../../lib/api";
import { ConnectionScreen, Loading } from "../../components/ui";
type Auth = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeLanguage: (language: Language) => Promise<void>;
  changeDefaultPage: (page: DefaultPage) => Promise<void>;
  saving: boolean;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { i18n } = useTranslation();
  const [unavailable, setUnavailable] = useState(false);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      await api("/health");
      try {
        return (await api<{ user: User }>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });
  useEffect(() => {
    if (session.data) void i18n.changeLanguage(session.data.preferredLanguage);
  }, [session.data, i18n]);
  const clear = useCallback(() => {
    void client.cancelQueries();
    client.removeQueries({
      predicate: (query) => query.queryKey[0] !== "session",
    });
    client.getMutationCache().clear();
    client.setQueryData(["session"], null);
  }, [client]);
  useEffect(() => {
    window.addEventListener("clinic:unauthorized", clear);
    return () => window.removeEventListener("clinic:unauthorized", clear);
  }, [clear]);
  useEffect(() => {
    const offline = () => setUnavailable(true);
    window.addEventListener("clinic:unavailable", offline);
    return () => window.removeEventListener("clinic:unavailable", offline);
  }, []);
  const preferencesMutation = useMutation({
    mutationFn: async (preferences: {
      preferredLanguage?: Language;
      defaultPage?: DefaultPage;
    }) =>
      (
        await api<{ user: User }>("/users/me/preferences", {
          method: "PATCH",
          body: JSON.stringify(preferences),
        })
      ).user,
    onSuccess: (user) => {
      if (client.getQueryData<User | null>(["session"])?.id !== user.id) return;
      client.setQueryData(["session"], user);
      void i18n.changeLanguage(user.preferredLanguage);
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.status >= 500 || e.status === 0))
        setUnavailable(true);
    },
  });
  if (session.isPending) return <Loading />;
  if (session.isError || unavailable)
    return (
      <ConnectionScreen
        retry={() => {
          setUnavailable(false);
          void session.refetch();
        }}
      />
    );
  const value: Auth = {
    user: session.data ?? null,
    saving: preferencesMutation.isPending,
    async login(username, password) {
      const { user } = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      client.getMutationCache().clear();
      client.setQueryData(["session"], user);
      await i18n.changeLanguage(user.preferredLanguage);
    },
    async logout() {
      await api("/auth/logout", { method: "POST" });
      clear();
    },
    async changeLanguage(language) {
      if (session.data)
        await preferencesMutation.mutateAsync({ preferredLanguage: language });
      else await i18n.changeLanguage(language);
    },
    async changeDefaultPage(defaultPage) {
      if (session.data)
        await preferencesMutation.mutateAsync({ defaultPage });
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
