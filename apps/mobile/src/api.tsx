import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ApolloClient, HttpLink, InMemoryCache, gql } from "@apollo/client";

import type { DashboardQuery } from "./generated/graphql";
export type Purchase = DashboardQuery["purchases"][number];
export type Return = DashboardQuery["returns"][number];
export type Run = DashboardQuery["runs"][number];
export type Data = Pick<DashboardQuery, "purchases" | "returns" | "runs">;
const Context = createContext<null | {
  token: string | null;
  ready: boolean;
  setToken: (v: string | null, refresh?: string) => Promise<void>;
  request: <T>(
    operation: string,
    variables?: Record<string, unknown>,
  ) => Promise<T>;
}>(null);
export function ApiProvider({ children }: { children: React.ReactNode }) {
  const refreshRef = useRef<string | null>(null);
  const [token, setTokenState] = useState<string | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (Platform.OS !== "web") {
          const refresh = await SecureStore.getItemAsync("radar-refresh");
          if (refresh) {
            const response = await fetch(
              process.env.EXPO_PUBLIC_API_URL ||
                "http://localhost:4000/graphql",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  query:
                    "mutation Refresh($refreshToken:String!){refreshSession(refreshToken:$refreshToken){token refreshToken}}",
                  variables: { refreshToken: refresh },
                }),
              },
            );
            const result = await response.json();
            if (result.data?.refreshSession) {
              await SecureStore.setItemAsync(
                "radar-session",
                result.data.refreshSession.token,
              );
              await SecureStore.setItemAsync(
                "radar-refresh",
                result.data.refreshSession.refreshToken,
              );
              refreshRef.current = result.data.refreshSession.refreshToken;
              if (mounted) setTokenState(result.data.refreshSession.token);
            } else {
              await SecureStore.deleteItemAsync("radar-session");
              await SecureStore.deleteItemAsync("radar-refresh");
            }
          }
        }
      } finally {
        if (mounted) setReady(true);
      }
    })().catch(async () => {try{if(Platform.OS!=='web'){const saved=await SecureStore.getItemAsync('radar-session');refreshRef.current=await SecureStore.getItemAsync('radar-refresh');if(mounted)setTokenState(saved)}}finally{if(mounted)setReady(true)}});
    return () => {
      mounted = false;
    };
  }, []);
  const client = useMemo(
    () =>
      new ApolloClient({
        link: new HttpLink({
          uri:
            process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/graphql",
          headers: token ? { authorization: `Bearer ${token}` } : {},
        }),
        cache: new InMemoryCache(),
      }),
    [token],
  );
  async function setToken(v: string | null, refresh?: string) {
    refreshRef.current = refresh || null;
    if (Platform.OS !== "web") {
      if (v) {
        await SecureStore.setItemAsync("radar-session", v);
        if (refresh) await SecureStore.setItemAsync("radar-refresh", refresh);
      } else {
        await SecureStore.deleteItemAsync("radar-session");
        await SecureStore.deleteItemAsync("radar-refresh");
      }
    }
    setTokenState(v);
  }
  async function request<T>(
    operation: string,
    variables: Record<string, unknown> = {},
  ) {
    const perform = async (active: ApolloClient) => {
      const doc = gql(operation);
      if (operation.trim().startsWith("mutation")) {
        const result = await active.mutate({ mutation: doc, variables });
        return result.data as T;
      }
      const result = await active.query({
        query: doc,
        variables,
        fetchPolicy: "network-only",
      });
      return result.data as T;
    };
    try {
      return await perform(client);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNAUTHENTICATED") &&
        refreshRef.current
      ) {
        const result = await fetch(
          process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/graphql",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              query:
                "mutation Refresh($refreshToken:String!){refreshSession(refreshToken:$refreshToken){token refreshToken}}",
              variables: { refreshToken: refreshRef.current },
            }),
          },
        ).then((r) => r.json());
        const session = result.data?.refreshSession;
        if (session) {
          await setToken(session.token, session.refreshToken);
          const renewed = new ApolloClient({
            link: new HttpLink({
              uri:
                process.env.EXPO_PUBLIC_API_URL ||
                "http://localhost:4000/graphql",
              headers: { authorization: `Bearer ${session.token}` },
            }),
            cache: new InMemoryCache(),
          });
          return perform(renewed);
        }
        await setToken(null);
      }
      throw error;
    }
  }

  return (
    <Context.Provider value={{ token, ready, setToken, request }}>
      {children}
    </Context.Provider>
  );
}
export function useApi() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing API provider");
  return value;
}
export const dashboardQuery = `query Dashboard { purchases { id merchant item amountMinor currency deadline notes version } returns { id purchaseId item merchant currency state expectedMinor receivedMinor remainingMinor label carrier } runs { id name plannedAt } }`;
export const precision = (currency: string) =>
  currency === "JPY" || currency === "KRW"
    ? 0
    : currency === "KWD" || currency === "BHD"
      ? 3
      : 2;
export function minor(input: string, currency: string) {
  const p = precision(currency);
  const re = p === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${p}})?$`);
  if (!re.test(input))
    throw new Error(`Enter a positive amount with up to ${p} decimal places.`);
  const [whole, fraction = ""] = input.split(".");
  const amount =
    BigInt(whole) * 10n ** BigInt(p) + BigInt(fraction.padEnd(p, "0") || "0");
  if (amount <= 0n || amount > 9007199254740991n)
    throw new Error("Amount is outside the supported range.");
  return amount.toString();
}
export function money(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(amount) / 10 ** precision(currency));
}
