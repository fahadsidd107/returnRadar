import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Linking,
} from "react-native";
import {
  Text,
  Button as PaperButton,
  TextInput,
  ActivityIndicator,
  Chip,
  Switch,
  useTheme,
  Icon,
  Divider,
  Dialog,
  Portal,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { database } from "../drafts";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import {
  useApi,
  dashboardQuery,
  Data,
  Purchase,
  Return,
  Run,
  money,
  minor,
} from "../api";
import { BrandMark, BrandTransition } from "../Brand";
import { useAppearance } from "./_layout";

type Tab = "Radar" | "Purchases" | "Returns" | "Profile";
const tabs: [Tab, string][] = [
  ["Radar", "radar"],
  ["Purchases", "shopping-outline"],
  ["Returns", "package-variant-closed"],
  ["Profile", "account-outline"],
];
const empty: Data = { purchases: [], returns: [], runs: [] };
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
function Surface({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.colors.surface,
          borderColor: t.colors.outline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}
function Caption({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[styles.caption, { color: t.colors.onSurfaceVariant }]}>
      {children}
    </Text>
  );
}
function Empty({
  title,
  body,
  action,
  label,
}: {
  title: string;
  body: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <Surface>
      <View style={styles.emptyIcon}>
        <Icon source="package-variant-closed" size={30} />
      </View>
      <Text variant="titleLarge" style={styles.semibold}>
        {title}
      </Text>
      <Caption>{body}</Caption>
      {action && (
        <Button mode="contained" onPress={action} style={styles.top}>
          {label}
        </Button>
      )}
    </Surface>
  );
}
function Button(props:React.ComponentProps<typeof PaperButton>){return <PaperButton {...props} contentStyle={[{minHeight:48},props.contentStyle]} style={[{borderRadius:14},props.style]}/>}
function Field({
  label,
  value,
  onChangeText,
  ...rest
}: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      mode="outlined"
      label={label}
      accessibilityLabel={typeof label==='string'?label:undefined}
      value={value}
      onChangeText={onChangeText}
      style={styles.field}
      {...rest}
    />
  );
}
export default function App() {
  const api = useApi(),
    theme = useTheme(),
    appearance = useAppearance();
  const [tab, setTab] = useState<Tab>("Radar"),
    [data, setData] = useState<Data>(empty),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
      "purchase" | "run" | "runDetail" | "return" | "detail" | null
    >(null),
    [selectedRun, setSelectedRun] = useState<Run | null>(null),
    [selected, setSelected] = useState<Purchase | null>(null),
    [selectedReturn, setSelectedReturn] = useState<Return | null>(null),
    [search, setSearch] = useState(""),
    [animation, setAnimation] = useState(true),
    [fullAnimation,setFullAnimation]=useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  const [label, setLabel] = useState(""),
    [carrier, setCarrier] = useState(""),
    [refund, setRefund] = useState("");
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer)},[]);
  const freshData=useRef(false);const [cacheStamp,setCacheStamp]=useState<string|null>(null);
  useEffect(()=>{if(!api.token||Platform.OS==='web')return;let live=true;database().then(db=>db.getFirstAsync<{value:string}>('SELECT value FROM drafts WHERE key=?','dashboard')).then(row=>{if(row&&live&&!freshData.current){const cached=JSON.parse(row.value);if(Array.isArray(cached.data?.purchases)&&Array.isArray(cached.data?.returns)&&Array.isArray(cached.data?.runs)){setData(cached.data);setCacheStamp(cached.savedAt)}}}).catch(()=>{});return()=>{live=false}},[api.token]);
  const refresh = useCallback(async () => {
    if (!api.token) return;
    setLoading(true);
    setError("");
    try {
      const next=await api.request<Data>(dashboardQuery);freshData.current=true;setData(next);setCacheStamp(null);
      if(Platform.OS!=='web')database().then(db=>db.runAsync('INSERT INTO drafts(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','dashboard',JSON.stringify({data:next,savedAt:new Date().toISOString()}))).catch(()=>{});
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [api.token]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  async function action(
    operation: string,
    variables: Record<string, unknown>,
    success: string,
  ) {
    setBusy(true);
    setError("");
    try {
      await api.request(operation, variables);
      setNotice(success);
      await refresh();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openReturn(r: Return) {
    setSelectedReturn(r);
    setLabel(r.label);
    setCarrier(r.carrier);
    setRefund("");
    setModal("return");
  }
  const [pendingLink,setPendingLink]=useState<string|null>(null);
  useEffect(()=>{Linking.getInitialURL().then(v=>setPendingLink(v||null)).catch(()=>{});const sub=Linking.addEventListener('url',e=>setPendingLink(e.url));let push:{remove:()=>void}|undefined;if(Platform.OS!=='web')push=Notifications.addNotificationResponseReceivedListener(response=>{const url=response.notification.request.content.data?.url;if(typeof url==='string')setPendingLink(url)});return()=>{sub.remove();push?.remove()}},[]);
  useEffect(()=>{if(!pendingLink||!api.token)return;void Promise.resolve().then(()=>{const parts=pendingLink.replace(/^[^:]+:\/\//,'').split('/').filter(Boolean);const key=parts[0],value=parts[1];if(['return','returns'].includes(key)){const found=data.returns.find(r=>r.id===value);if(found){openReturn(found);setPendingLink(null)}}if(['purchase','purchases'].includes(key)){const found=data.purchases.find(p=>p.id===value);if(found){setSelected(found);setModal('detail');setPendingLink(null)}}if(['run','runs'].includes(key)){const found=data.runs.find(r=>r.id===value);if(found){setSelectedRun(found);setModal('runDetail');setPendingLink(null)}}})},[pendingLink,data,api.token]);
  const currentReturn = selectedReturn
    ? data.returns.find((r) => r.id === selectedReturn.id) || selectedReturn
    : null;
  if (!api.ready)
    return (
      <View style={[styles.center, { backgroundColor: "#102A43" }]}>
        <BrandMark size={96} />
        <ActivityIndicator color="#53E0BA" style={styles.top} />
      </View>
    );
  if (animation) return <BrandTransition shorten={!fullAnimation} onDone={() => {setAnimation(false);setFullAnimation(false)}} />;
  if (!api.token) return <Auth />;
  const outstanding = new Map<string, bigint>();
  data.returns
    .filter((r) => r.state !== "cancelled")
    .forEach((r) =>
      outstanding.set(
        r.currency,
        (outstanding.get(r.currency) || 0n) + BigInt(r.remainingMinor),
      ),
    );
  const attention = data.purchases.filter(
    (p) =>
      !data.returns.some((r) => r.purchaseId === p.id) &&
      Date.parse(p.deadline + "T23:59:59") - clock < 7 * 86400000,
  );
  const active = data.returns.filter(
    (r) => !["resolved", "cancelled"].includes(r.state),
  );
  const filtered = data.purchases.filter((p) =>
    (p.merchant + " " + p.item).toLowerCase().includes(search.toLowerCase()),
  );
  const nextState: Record<string, string> = {
    requested: "packed",
    packed: "dropped_off",
    dropped_off: "delivered",
    delivered: "resolved",
  };
  const nextLabel: Record<string, string> = {
    requested: "Confirm parcel packed",
    packed: "Confirm handed over",
    dropped_off: "Confirm delivered",
    delivered: "Close resolved return",
  };
  return (
    <SafeAreaView
      style={[styles.page, { backgroundColor: theme.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.appHeader}>
        <View style={styles.brandRow}>
          <View style={styles.smallMark}>
            <BrandMark size={32} />
          </View>
          <Text style={styles.brandName}>Return Radar</Text>
        </View>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: error ? "#F4B544" : "#53E0BA" },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={theme.colors.onSurface}
          />
        }
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.eyebrow, { color: theme.colors.onSurfaceVariant }]}
            >
              {tab === "Radar"
                ? "A CLEAR NEXT STEP"
                : tab === "Returns"
                  ? "FROM PARCEL TO REFUND"
                  : tab === "Purchases"
                    ? "YOUR PURCHASES, ORGANISED"
                    : "MAKE IT YOURS"}
            </Text>
            <Text variant="headlineLarge" style={styles.heading}>
              {tab === "Radar" ? "Your return radar" : tab}
            </Text>
          </View>
          {tab === "Purchases" && (
            <Button
              mode="contained"
              icon="plus"
              onPress={() => setModal("purchase")}
            >
              Add
            </Button>
          )}
        </View>
        {!!cacheStamp&&<Text style={styles.notice}>Cached on this device · last synced {new Date(cacheStamp).toLocaleString()}. Server confirmation is required for every change.</Text>}
        {!!error && (
          <Surface>
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.error }}
            >
              Unable to sync: {error}
            </Text>
            <Caption>
              Displayed data may be stale. Changes are confirmed only after the
              server accepts them.
            </Caption>
            <Button onPress={refresh} textColor={theme.colors.onSurface}>
              Try again
            </Button>
          </Surface>
        )}
        {!!notice && (
          <Pressable
            onPress={() => setNotice("")}
            accessibilityLabel="Dismiss status"
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.notice, { color: theme.colors.onSurface }]}
            >
              {notice} · Dismiss
            </Text>
          </Pressable>
        )}
        {tab === "Radar" && (
          <>
            <View style={styles.balance}>
              <Text style={styles.balanceLabel}>WAITING TO COME BACK</Text>
              {outstanding.size ? (
                [...outstanding].map(([currency, amount]) => (
                  <Text key={currency} style={styles.balanceAmount}>
                    {money(amount.toString(), currency)}
                  </Text>
                ))
              ) : (
                <Text style={styles.balanceAmount}>All clear.</Text>
              )}
              <Text style={styles.balanceSub}>
                {active.length} active{" "}
                {active.length === 1 ? "return" : "returns"} · amounts grouped
                by currency
              </Text>
            </View>
            <View style={styles.sectionRow}>
              <Text variant="titleLarge" style={styles.semibold}>
                Next on your list
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                {attention.length} decisions
              </Text>
            </View>
            {!attention.length ? (
              <Empty
                title="Room to breathe"
                body="Add a purchase and its confirmed return deadline. Your next decisions will appear here."
                action={() => setModal("purchase")}
                label="Add a purchase"
              />
            ) : (
              attention.map((p) => (
                <Surface
                  key={p.id}
                  onPress={() => {
                    setSelected(p);
                    setModal("detail");
                  }}
                >
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.parcelBadge,
                        { backgroundColor: "#FFF0CF" },
                      ]}
                    >
                      <Icon source="clock-outline" size={24} color="#102A43" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.semibold}>{p.item}</Text>
                      <Caption>
                        {p.merchant} · {money(p.amountMinor, p.currency)}
                      </Caption>
                    </View>
                    <Icon source="chevron-right" size={24} />
                  </View>
                  <View style={styles.top}>
                    <Text style={{ color: theme.colors.onSurface }}>
                      Decision deadline · {p.deadline}
                    </Text>
                  </View>
                </Surface>
              ))
            )}
            <Pressable
              onPress={() => setTab("Returns")}
              accessibilityRole="button"
              style={styles.runFeature}
            >
              <View style={styles.row}>
                <Icon source="map-marker-path" color="#53E0BA" size={30} />
                <Text style={styles.runEyebrow}>RETURN RUNS</Text>
              </View>
              <Text style={styles.runTitle}>
                One outing.\nA lighter to-do list.
              </Text>
              <Text style={styles.runBody}>
                Gather your returns and plan a trip to your chosen drop-off
                points.
              </Text>
              <View style={styles.runLink}>
                <Text style={styles.runLinkText}>Organise a Return Run</Text>
                <Icon source="arrow-right" size={21} color="#53E0BA" />
              </View>
            </Pressable>
            <View style={styles.sectionRow}>
              <Text variant="titleLarge" style={styles.semibold}>
                In progress
              </Text>
            </View>
            {active.slice(0, 3).map((r) => (
              <ReturnCard key={r.id} value={r} onPress={() => openReturn(r)} />
            ))}
            {!active.length && (
              <Caption>
                Your return timeline will appear here once you start a return.
              </Caption>
            )}
          </>
        )}
        {tab === "Purchases" && (
          <>
            <TextInput
              mode="outlined"
              placeholder="Search merchant or item"
              accessibilityLabel="Search purchases"
              left={<TextInput.Icon icon="magnify" />}
              value={search}
              onChangeText={setSearch}
              style={{ marginBottom: 20 }}
            />
            {filtered.map((p) => (
              <Surface
                key={p.id}
                onPress={() => {
                  setSelected(p);
                  setModal("detail");
                }}
              >
                <Caption>{p.merchant.toUpperCase()}</Caption>
                <Text variant="titleLarge" style={styles.semibold}>
                  {p.item}
                </Text>
                <View style={styles.sectionRow}>
                  <Text style={styles.amount}>
                    {money(p.amountMinor, p.currency)}
                  </Text>
                  <Text>Decide by {p.deadline}</Text>
                </View>
              </Surface>
            ))}
            {!filtered.length && !loading && (
              <Empty
                title={
                  search ? "No matching purchases" : "Start with one purchase"
                }
                body="Keep the receipt and deadline close to the item. Add your own confirmed deadline rather than relying on a retailer policy assumption."
                action={() => setModal("purchase")}
                label="Add purchase"
              />
            )}
            <Caption>
              Showing up to 50 recent purchases. Pull down to refresh.
            </Caption>
          </>
        )}
        {tab === "Returns" && (
          <>
            <View style={styles.sectionRow}>
              <Text variant="titleLarge" style={styles.semibold}>
                Return Runs
              </Text>
              <Button
                icon="plus"
                onPress={() => setModal("run")}
                textColor={theme.colors.onSurface}
              >
                Create run
              </Button>
            </View>
            {data.runs.map((run) => (
              <Surface
                key={run.id}
                onPress={() => {
                  setSelectedRun(run);
                  setModal("runDetail");
                }}
              >
                <View style={styles.row}>
                  <Icon source="map-marker-path" size={28} />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{run.name}</Text>
                    <Caption>
                      {new Date(run.plannedAt).toLocaleString()}
                    </Caption>
                  </View>
                </View>
                <Caption>
                  Open outing to assign parcels, see label references and
                  confirm individual handovers.
                </Caption>
              </Surface>
            ))}
            {!data.runs.length && (
              <Caption>
                No outings planned yet. Create a named run with a date and time.
              </Caption>
            )}
            <View style={styles.sectionRow}>
              <Text variant="titleLarge" style={styles.semibold}>
                Your returns
              </Text>
              <Text>{active.length} active</Text>
            </View>
            {data.returns.map((r) => (
              <ReturnCard key={r.id} value={r} onPress={() => openReturn(r)} />
            ))}
            {!data.returns.length && (
              <Empty
                title="Nothing to send back"
                body="Start a return from a purchase when you've made your decision."
                action={() => setTab("Purchases")}
                label="View purchases"
              />
            )}
          </>
        )}
        {tab === "Profile" && (
          <>
            <Surface>
              <View style={styles.sectionRow}>
                <View>
                  <Text variant="titleMedium">Dark appearance</Text>
                  <Caption>Comfortable in either light.</Caption>
                </View>
                <Switch
                  value={appearance.dark}
                  onValueChange={appearance.toggle}
                  accessibilityLabel="Dark appearance"
                />
              </View>
            </Surface>
            <Surface>
              <Text variant="titleMedium">Your data stays yours</Text>
              <Caption>
                Credentials are kept in the platform secure store on native
                devices. This browser preview keeps its session in memory.
                Purchases and refunds are stored on your configured server.
              </Caption>
              <Caption>
                Push delivery requires configured credentials and a physical device.
                Offline mutations are not queued in this build.
              </Caption>
            </Surface>
            <NotificationCentre onDeepLink={setPendingLink}/><ExportData />
            {__DEV__ && (
              <Button
                mode="outlined"
                textColor={theme.colors.onSurface}
                onPress={() => {setFullAnimation(true);setAnimation(true)}}
                style={styles.top}
              >
                Preview brand transition
              </Button>
            )}
            <Button
              mode="outlined"
              textColor={theme.colors.onSurface}
              onPress={async () => {
                if (await action("mutation { logout }", {}, "Signed out")) {
                  await api.setToken(null);
                  if (Platform.OS !== "web")
                    await (await database()).runAsync("DELETE FROM drafts");
                  setData(empty);
                }
              }}
              disabled={busy}
              style={styles.top}
            >
              Sign out
            </Button>
            <Button
              textColor={theme.colors.error}
              onPress={() => setDeleteConfirm(true)}
              style={styles.top}
            >
              Delete account and all data
            </Button>
            <Caption>Development build · No verified store release</Caption>
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outline,
          },
        ]}
      >
        {tabs.map(([name, icon]) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name }}
            onPress={() => setTab(name)}
            style={[
              styles.tab,
              tab === name && { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            <Icon source={icon} size={24} color={theme.colors.onSurface} />
            <Text
              style={[
                styles.tabLabel,
                { fontWeight: tab === name ? "700" : "400" },
              ]}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Portal>
        <Dialog
          visible={deleteConfirm}
          onDismiss={() => setDeleteConfirm(false)}
        >
          <Dialog.Title>Delete your account?</Dialog.Title>
          <Dialog.Content>
            <Text>
              This permanently deletes the account, sessions, purchases, returns
              and refund records on this server. This cannot be undone. Backup
              retention depends on the server operator.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              textColor={theme.colors.onSurface}
              onPress={() => setDeleteConfirm(false)}
            >
              Keep account
            </Button>
            <Button
              textColor={theme.colors.error}
              disabled={busy}
              onPress={async () => {
                if (
                  await action(
                    "mutation { deleteAccount }",
                    {},
                    "Account deleted",
                  )
                ) {
                  await api.setToken(null);
                  if (Platform.OS !== "web")
                    await (await database()).runAsync("DELETE FROM drafts");
                  setData(empty);
                }
              }}
            >
              Delete permanently
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Portal>
        <Dialog
          visible={modal !== null}
          onDismiss={() => !busy && setModal(null)}
          style={{
            maxHeight: "92%",
            maxWidth: 600,
            width: "92%",
            alignSelf: "center",
          }}
        >
          <Dialog.Title>
            {modal === "purchase"
              ? "Add purchase"
              : modal === "run"
                ? "Plan a Return Run"
                : modal === "runDetail"
                  ? "Return Run"
                  : modal === "detail"
                    ? "Purchase details"
                    : "Return details"}
          </Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingVertical: 12 }}
            >
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={{ color: theme.colors.error, marginBottom: 12 }}
                >
                  {error}
                </Text>
              )}
              {modal === "purchase" && (
                <PurchaseForm
                  busy={busy}
                  onSave={async (v) => {
                    const ok = await action(
                      "mutation Order($merchant:String!,$currency:String!,$deadline:String!,$notes:String,$items:[OrderItemInput!]!){createOrder(merchant:$merchant,currency:$currency,deadline:$deadline,notes:$notes,items:$items)}",
                      v,
                      "Purchase saved",
                    );
                    if (ok) setModal(null);
                    return ok;
                  }}
                />
              )}
              {modal === "run" && (
                <RunForm
                  busy={busy}
                  onSave={async (v) => {
                    if (
                      await action(
                        "mutation Run($name:String!,$plannedAt:String!){createReturnRun(name:$name,plannedAt:$plannedAt)}",
                        v,
                        "Return Run created",
                      )
                    )
                      setModal(null);
                  }}
                />
              )}
              {modal === "runDetail" && selectedRun && (
                <RunDetail
                  run={selectedRun}
                  returns={data.returns}
                  onChange={refresh}
                />
              )}
              {modal === "detail" && selected && (
                <>
                  <Caption>{selected.merchant}</Caption>
                  <Text variant="headlineSmall" style={styles.semibold}>
                    {selected.item}
                  </Text>
                  <Text style={[styles.amount, styles.top]}>
                    {money(selected.amountMinor, selected.currency)}
                  </Text>
                  <Caption>
                    Confirmed decision deadline: {selected.deadline}
                  </Caption>
                  <Caption>{selected.notes || "No notes added."}</Caption>
                  <PartialReturnPicker
                    purchase={selected}
                    onChange={refresh}
                    onOpen={openReturn}
                    existing={data.returns.filter(
                      (r) => r.purchaseId === selected.id,
                    )}
                  />
                  <Button
                    mode="outlined"
                    textColor={theme.colors.onSurface}
                    disabled={busy}
                    onPress={async () => {
                      if (
                        await action(
                          "mutation Archive($purchaseId:String!,$version:Int!){archivePurchase(purchaseId:$purchaseId,version:$version)}",
                          {
                            purchaseId: selected.id,
                            version: selected.version,
                          },
                          "Purchase archived",
                        )
                      )
                        setModal(null);
                    }}
                    style={styles.top}
                  >
                    Archive purchase
                  </Button>
                  <PurchaseEditor purchase={selected} onChange={refresh}/><ReminderForm scope={{purchaseId:selected.id}} kinds={['decision']}/><Documents purchaseId={selected.id} />
                  <Similar purchaseId={selected.id} />
                </>
              )}
              {modal === "return" && currentReturn && (
                <>
                  <Caption>{currentReturn.merchant}</Caption>
                  <Text variant="headlineSmall">{currentReturn.item}</Text>
                  <Chip icon="package-variant" style={styles.top}>
                    {currentReturn.state.replaceAll("_", " ")}
                  </Chip>
                  <View style={styles.top}>
                    <Text style={styles.amount}>
                      {money(
                        currentReturn.remainingMinor,
                        currentReturn.currency,
                      )}{" "}
                      outstanding
                    </Text>
                    <Caption>
                      {money(
                        currentReturn.receivedMinor,
                        currentReturn.currency,
                      )}{" "}
                      received of{" "}
                      {money(
                        currentReturn.expectedMinor,
                        currentReturn.currency,
                      )}{" "}
                      expected
                    </Caption>
                  </View>
                  <View style={styles.timeline}>
                    {[
                      "requested",
                      "packed",
                      "dropped_off",
                      "delivered",
                      "resolved",
                    ].map((state, i) => (
                      <View key={state} style={styles.timelineRow}>
                        <View
                          style={[
                            styles.timelineDot,
                            {
                              backgroundColor:
                                [
                                  "requested",
                                  "packed",
                                  "dropped_off",
                                  "delivered",
                                  "resolved",
                                ].indexOf(currentReturn.state) >= i
                                  ? "#53E0BA"
                                  : theme.colors.outline,
                            },
                          ]}
                        />
                        <Text>{state.replaceAll("_", " ")}</Text>
                      </View>
                    ))}
                  </View>
                  {currentReturn.state === "requested" && (
                    <>
                      <Field
                        label="Label / QR reference"
                        value={label}
                        onChangeText={setLabel}
                      />
                      <Field
                        label="Confirmed carrier / drop-off method"
                        value={carrier}
                        onChangeText={setCarrier}
                      />
                      <Caption>
                        Confirm the parcel is packed and this reference belongs
                        to this item. Document uploads and QR rendering are not
                        available yet.
                      </Caption>
                    </>
                  )}
                  {currentReturn.label !== "" &&
                    currentReturn.state !== "requested" && (
                      <Surface>
                        <Caption>PARCEL LABEL REFERENCE</Caption>
                        <Text selectable>{currentReturn.label}</Text>
                        <Caption>{currentReturn.carrier}</Caption>
                      </Surface>
                    )}
                  {nextState[currentReturn.state] && (
                    <Button
                      mode="contained"
                      disabled={busy}
                      loading={busy}
                      style={styles.top}
                      onPress={() =>
                        action(
                          "mutation Advance($returnId:String!,$nextState:String!,$label:String,$carrier:String){advanceReturn(returnId:$returnId,nextState:$nextState,label:$label,carrier:$carrier)}",
                          {
                            returnId: currentReturn.id,
                            nextState: nextState[currentReturn.state],
                            label,
                            carrier,
                          },
                          "Return updated",
                        )
                      }
                    >
                      {nextLabel[currentReturn.state]}
                    </Button>
                  )}
                  {!["cancelled", "resolved"].includes(currentReturn.state) && (
                    <>
                      <Field
                        label={`Refund received (${currentReturn.currency})`}
                        keyboardType="decimal-pad"
                        value={refund}
                        onChangeText={setRefund}
                      />
                      <Button
                        mode="outlined"
                        textColor={theme.colors.onSurface}
                        disabled={busy || !refund}
                        onPress={async () => {
                          try {
                            const value = minor(refund, currentReturn.currency);
                            if (
                              await action(
                                "mutation Refund($returnId:String!,$amountMinor:String!){recordRefund(returnId:$returnId,amountMinor:$amountMinor)}",
                                {
                                  returnId: currentReturn.id,
                                  amountMinor: value,
                                },
                                "Refund receipt recorded",
                              )
                            )
                              setRefund("");
                          } catch (e) {
                            setError(message(e));
                          }
                        }}
                      >
                        Confirm money received
                      </Button>
                      <Caption>
                        Only record funds you have checked as received. Partial
                        refunds are supported.
                      </Caption>
                      <FeeForm
                        returnId={currentReturn.id}
                        currency={currentReturn.currency}
                        onChange={refresh}
                      />
                    </>
                  )}
                  <FollowupTemplate key={currentReturn.id} record={currentReturn}/><ReminderForm scope={{returnId:currentReturn.id}} kinds={['shipping','refund']}/><Documents returnId={currentReturn.id} />
                  {["requested", "packed"].includes(currentReturn.state) && (
                    <Button
                      textColor={theme.colors.error}
                      disabled={busy}
                      onPress={() =>
                        action(
                          "mutation Cancel($returnId:String!,$nextState:String!){advanceReturn(returnId:$returnId,nextState:$nextState)}",
                          {
                            returnId: currentReturn.id,
                            nextState: "cancelled",
                          },
                          "Return cancelled",
                        )
                      }
                    >
                      Cancel return
                    </Button>
                  )}
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button
              disabled={busy}
              textColor={theme.colors.onSurface}
              onPress={() => {
                setModal(null);
                setError("");
              }}
            >
              Done
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}
function ReturnCard({
  value: r,
  onPress,
}: {
  value: Return;
  onPress: () => void;
}) {
  return (
    <Surface onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.parcelBadge, { backgroundColor: "#E3F6EF" }]}>
          <Icon source="package-variant-closed" size={24} color="#102A43" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.semibold}>{r.item}</Text>
          <Caption>
            {r.merchant} · {r.state.replaceAll("_", " ")}
          </Caption>
        </View>
        <Icon source="chevron-right" size={24} />
      </View>
      <View style={styles.sectionRow}>
        <Caption>Refund outstanding</Caption>
        <Text style={styles.semibold}>
          {money(r.remainingMinor, r.currency)}
        </Text>
      </View>
    </Surface>
  );
}
function Auth() {
  const api = useApi(),
    theme = useTheme();
  const [mode, setMode] = useState<
    "signin" | "register" | "verify" | "forgot" | "reset"
  >("signin");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signin") {
        const result = await api.request<{
          signIn: { token: string; refreshToken: string };
        }>(
          "mutation SignIn($email:String!,$password:String!){signIn(email:$email,password:$password){token refreshToken expiresAt}}",
          { email, password },
        );
        if(Platform.OS!=='web')await(await database()).runAsync('DELETE FROM drafts');
        await api.setToken(result.signIn.token, result.signIn.refreshToken);
      }
      if (mode === "register") {
        await api.request(
          "mutation Register($email:String!,$password:String!){register(email:$email,password:$password)}",
          { email, password },
        );
        setNotice(
          "If this address can be registered, a verification email has been sent. Check your inbox, then enter its token.",
        );
        setMode("verify");
      }
      if (mode === "verify") {
        await api.request(
          "mutation Verify($token:String!){verifyEmail(token:$token)}",
          { token },
        );
        setNotice("Email verified. You can now sign in.");
        setMode("signin");
      }
      if (mode === "forgot") {
        await api.request(
          "mutation Forgot($email:String!){requestPasswordReset(email:$email)}",
          { email },
        );
        setNotice(
          "If this address is registered, a reset email has been sent.",
        );
        setMode("reset");
      }
      if (mode === "reset") {
        await api.request(
          "mutation Reset($token:String!,$password:String!){resetPassword(token:$token,password:$password)}",
          { token, password },
        );
        setNotice("Password reset. Sign in with your new password.");
        setMode("signin");
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView
      style={[styles.page, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.auth}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authBrand}>
            <BrandMark size={88} />
          </View>
          <Text
            style={[
              styles.eyebrow,
              { marginTop: 32, color: theme.colors.onSurfaceVariant },
            ]}
          >
            A LITTLE ORGANISATION. A CLEAR NEXT STEP.
          </Text>
          <Text style={styles.authTitle}>
            {mode === "signin"
              ? "Bring your returns\nunder control."
              : mode === "register"
                ? "A fresh start\nfor your purchases."
                : mode === "verify"
                  ? "Check your inbox."
                  : mode === "forgot"
                    ? "Let’s get you\nback in."
                    : "Choose a new\npassword."}
          </Text>
          <Caption>
            Purchase decisions, parcels and refunds. Together in one dependable
            place.
          </Caption>
          <View style={{ height: 20 }} />
          {!["verify", "reset"].includes(mode) && (
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
          {["verify", "reset"].includes(mode) && (
            <Field
              label="Token from your email"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
            />
          )}
          {["signin", "register", "reset"].includes(mode) && (
            <Field
              label={
                mode === "reset"
                  ? "New password (12+ characters)"
                  : "Password (12+ characters)"
              }
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
            />
          )}{" "}
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.error, marginVertical: 12 }}
            >
              {error}
            </Text>
          )}
          {!!notice && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ marginVertical: 12 }}
            >
              {notice}
            </Text>
          )}
          <Button
            mode="contained"
            loading={busy}
            disabled={busy}
            onPress={submit}
            contentStyle={{ height: 54 }}
            style={styles.top}
          >
            {mode === "signin"
              ? "Sign in"
              : mode === "register"
                ? "Create account"
                : mode === "verify"
                  ? "Verify email"
                  : mode === "forgot"
                    ? "Send reset email"
                    : "Reset password"}
          </Button>
          {mode === "signin" ? (
            <>
              <Button
                textColor={theme.colors.onSurface}
                onPress={() => {
                  setMode("register");
                  setError("");
                }}
                style={styles.top}
              >
                New here? Create an account
              </Button>
              <Button
                textColor={theme.colors.onSurfaceVariant}
                onPress={() => {
                  setMode("forgot");
                  setError("");
                }}
              >
                Forgot password?
              </Button>
              <Button
                textColor={theme.colors.onSurfaceVariant}
                onPress={() => setMode("verify")}
              >
                Already have a verification token?
              </Button>
            </>
          ) : (
            <Button
              textColor={theme.colors.onSurface}
              onPress={() => {
                setMode("signin");
                setError("");
              }}
              style={styles.top}
            >
              Back to sign in
            </Button>
          )}
          <View style={styles.authFoot}>
            <Icon
              source="lock-outline"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
            <Caption>Your purchases. Your decisions. Your data.</Caption>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const schema = z.object({
  merchant: z.string().trim().min(1, "Enter a merchant.").max(160),
  item: z.string().trim().min(1, "Enter an item.").max(300),
  amount: z.string().min(1, "Enter an amount."),
  currency: z.enum([
    "EUR",
    "USD",
    "GBP",
    "CHF",
    "CAD",
    "AUD",
    "JPY",
    "KRW",
    "BHD",
    "KWD",
  ]),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Enter a valid date.",
    ),
  notes: z.string().max(10000),
});
type PurchaseValues = z.infer<typeof schema>;
const defaults: PurchaseValues = {
  merchant: "",
  item: "",
  amount: "",
  currency: "EUR",
  deadline: "",
  notes: "",
};
function PurchaseForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [extraItems, setExtraItems] = useState<
      { name: string; amount: string; quantity: string }[]
    >([]),
    [quantity, setQuantity] = useState("1");
  const [draftStatus, setDraftStatus] = useState(
      Platform.OS === "web"
        ? "Draft persistence is unavailable in this browser preview."
        : "Loading local draft…",
    ),
    [localError, setLocalError] = useState(""),
    [hydrated, setHydrated] = useState(false);
  const { control, handleSubmit, reset, watch, setValue } =
    useForm<PurchaseValues>({
      resolver: zodResolver(schema),
      defaultValues: defaults,
    });
  const values = watch();
  useEffect(() => {
    if (Platform.OS === "web") {
      setHydrated(true);
      return;
    }
    database()
      .then((db) =>
        db.getFirstAsync<{ value: string }>(
          "SELECT value FROM drafts WHERE key=?",
          "purchase",
        ),
      )
      .then((row) => {
        if (row) {
          const parsed = z
            .object({
              merchant: z.string(),
              item: z.string(),
              amount: z.string(),
              currency: schema.shape.currency,
              deadline: z.string(),
              notes: z.string(),
              quantity:z.string(),
              extraItems:z.array(z.object({name:z.string(),amount:z.string(),quantity:z.string()})),
            })
            .partial()
            .safeParse(JSON.parse(row.value));
          if (parsed.success){reset({...defaults,...parsed.data});setQuantity(parsed.data.quantity||'1');setExtraItems(parsed.data.extraItems||[])}
        }
        setDraftStatus(
          "Draft saved on this device. No credentials stored locally.",
        );
      })
      .catch(() =>
        setDraftStatus(
          "Local drafts unavailable. Keep this form open until saved.",
        ),
      )
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (!hydrated || Platform.OS === "web") return;
    const timer = setTimeout(() => {
      database()
        .then((db) =>
          db.runAsync(
            "INSERT INTO drafts(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            "purchase",
            JSON.stringify({...values,quantity,extraItems}),
          ),
        )
        .catch(() => setDraftStatus("Draft could not be saved locally."));
    }, 400);
    return () => clearTimeout(timer);
  }, [JSON.stringify({...values,quantity,extraItems}), hydrated]);
  return (
    <>
      <Caption>
        Use the deadline you confirmed with the merchant. Dates are decision
        reminders, not a policy guarantee.
      </Caption>
      {(["merchant", "item", "amount", "deadline", "notes"] as const).map(
        (name) => (
          <Controller
            key={name}
            control={control}
            name={name}
            render={({
              field: { value, onChange, onBlur },
              fieldState: { error },
            }) => (
              <>
                <Field
                  label={
                    {
                      merchant: "Merchant",
                      item: "Item",
                      amount: `Price (${values.currency})`,
                      deadline: "Decision deadline · YYYY-MM-DD",
                      notes: "Notes (optional)",
                    }[name]
                  }
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType={name === "amount" ? "decimal-pad" : "default"}
                  multiline={name === "notes"}
                  error={!!error}
                />
                {error && (
                  <Text style={{ color: "#A92D27" }}>{error.message}</Text>
                )}
              </>
            )}
          />
        ),
      )}
      <Field
        label="Quantity of first item"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
      />
      {extraItems.map((extra, index) => (
        <Surface key={index}>
          <Field
            label={`Item ${index + 2} name`}
            value={extra.name}
            onChangeText={(v) =>
              setExtraItems((old) =>
                old.map((x, i) => (i === index ? { ...x, name: v } : x)),
              )
            }
          />
          <Field
            label={`Unit price (${values.currency})`}
            value={extra.amount}
            onChangeText={(v) =>
              setExtraItems((old) =>
                old.map((x, i) => (i === index ? { ...x, amount: v } : x)),
              )
            }
            keyboardType="decimal-pad"
          />
          <Field
            label="Quantity"
            value={extra.quantity}
            onChangeText={(v) =>
              setExtraItems((old) =>
                old.map((x, i) => (i === index ? { ...x, quantity: v } : x)),
              )
            }
            keyboardType="number-pad"
          />
          <Button
            onPress={() =>
              setExtraItems((old) => old.filter((_, i) => i !== index))
            }
          >
            Remove item
          </Button>
        </Surface>
      ))}
      <Button
        onPress={() =>
          setExtraItems((old) => [
            ...old,
            { name: "", amount: "", quantity: "1" },
          ])
        }
      >
        Add another order item
      </Button>
      <Caption>Currency</Caption>
      <View style={styles.currencyRow}>
        {[
          "EUR",
          "USD",
          "GBP",
          "JPY",
          "KWD",
          "CHF",
          "CAD",
          "AUD",
          "KRW",
          "BHD",
        ].map((currency) => (
          <Chip
            key={currency}
            selected={values.currency === currency}
            onPress={() =>
              setValue("currency", currency as PurchaseValues["currency"])
            }
          >
            {currency}
          </Chip>
        ))}
      </View>
      <Caption>{draftStatus}</Caption>
      {!!localError && <Text style={{ color: "#A92D27" }}>{localError}</Text>}
      <Button
        mode="contained"
        disabled={busy || !hydrated}
        loading={busy}
        style={styles.top}
        onPress={() => {
          void handleSubmit(async (v) => {
            try {
              setLocalError("");
              const items = [
                { name: v.item, amount: v.amount, quantity },
                ...extraItems,
              ].map((x) => {
                if (
                  !x.name.trim() ||
                  !/^\d+$/.test(x.quantity) ||
                  Number(x.quantity) < 1 ||
                  Number(x.quantity) > 1000
                )
                  throw Error(
                    "Each order item needs a name and quantity between 1 and 1000.",
                  );
                return {
                  name: x.name.trim(),
                  unitAmountMinor: minor(x.amount, v.currency),
                  quantity: Number(x.quantity),
                };
              });
              const ok = await onSave({
                merchant: v.merchant,
                currency: v.currency,
                deadline: v.deadline,
                notes: v.notes,
                items,
              });
              if (ok && Platform.OS !== "web")
                await (
                  await database()
                ).runAsync("DELETE FROM drafts WHERE key=?", "purchase");
            } catch (e) {
              setLocalError(message(e));
            }
          })();
        }}
      >
        Save purchase
      </Button>
    </>
  );
}
function RunForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [when, setWhen] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <Caption>
        Choose a date and time with a timezone offset, for example
        2026-11-12T17:30:00+01:00. You can assign parcels after saving the
        outing. Stops use manually entered locations; no route optimisation is
        performed.
      </Caption>
      <Field label="Outing name" value={name} onChangeText={setName} />
      <Field
        label="Planned date and time (ISO 8601)"
        value={when}
        onChangeText={setWhen}
        autoCapitalize="none"
      />
      {!!error && <Text style={{ color: "#A92D27" }}>{error}</Text>}
      <Button
        mode="contained"
        disabled={busy}
        loading={busy}
        style={styles.top}
        onPress={async () => {
          if (
            !name.trim() ||
            !/[+-]\d\d:\d\d$|Z$/.test(when) ||
            Number.isNaN(Date.parse(when))
          ) {
            setError(
              "Enter a name and valid date/time including its timezone.",
            );
            return;
          }
          setError("");
          await onSave({ name, plannedAt: new Date(when).toISOString() });
        }}
      >
        Create Return Run
      </Button>
    </>
  );
}
function Similar({ purchaseId }: { purchaseId: string }) {
  const api = useApi();
  const theme = useTheme();
  const [rows, setRows] = useState<
      | {
          returnId: string;
          item: string;
          distance: number;
          explanation: string;
        }[]
      | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View style={styles.top}>
      <Divider />
      <Text variant="titleMedium" style={styles.top}>
        Similar past returns
      </Text>
      <Caption>
        Structured vector search across your resolved returns in the same
        currency. Matches use price, category and return method, without AI.
      </Caption>
      <Button
        textColor={theme.colors.onSurface}
        disabled={busy}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const result = await api.request<{
              similarPastReturns: {
                returnId: string;
                item: string;
                distance: number;
                explanation: string;
              }[];
            }>(
              "query Similar($purchaseId:String!,$category:Int!,$method:Int!){similarPastReturns(purchaseId:$purchaseId,category:$category,method:$method){returnId item distance explanation}}",
              { purchaseId, category: 3, method: 2 },
            );
            setRows(result.similarPastReturns);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Find historical matches
      </Button>
      {rows?.length === 0 && (
        <Caption>
          Not enough history yet. Resolved returns in this currency will appear
          here.
        </Caption>
      )}
      {rows?.map((r) => (
        <View key={r.returnId} style={styles.top}>
          <Text style={styles.semibold}>{r.item}</Text>
          <Caption>{r.explanation}</Caption>
        </View>
      ))}
      {!!error && <Text style={{ color: theme.colors.error }}>{error}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  appHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontFamily: "Manrope", fontSize: 18, fontWeight: "700" },
  smallMark: { backgroundColor: "#102A43", borderRadius: 10, padding: 5 },
  statusDot: { height: 8, width: 8, borderRadius: 4 },
  content: {
    paddingHorizontal: 20,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
    gap: 16,
  },
  eyebrow: {
    fontFamily: "Manrope",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    lineHeight: 18,
  },
  heading: { fontWeight: "700", marginTop: 6, letterSpacing: -0.7 },
  card: { padding: 20, borderWidth: 1, borderRadius: 18, marginBottom: 12 },
  caption: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 5,
    fontFamily: "Manrope",
  },
  semibold: { fontWeight: "700" },
  top: { marginTop: 16 },
  balance: {
    backgroundColor: "#102A43",
    padding: 24,
    borderRadius: 20,
    marginBottom: 28,
  },
  balanceLabel: {
    fontFamily: "Manrope",
    fontSize: 11,
    letterSpacing: 1.5,
    color: "#B8C8D2",
    fontWeight: "700",
  },
  balanceAmount: {
    fontFamily: "Manrope",
    fontSize: 38,
    lineHeight: 50,
    color: "#F7F8F4",
    fontWeight: "700",
    marginVertical: 10,
    fontVariant: ["tabular-nums"],
  },
  balanceSub: {
    fontFamily: "Manrope",
    fontSize: 13,
    lineHeight: 21,
    color: "#B8C8D2",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  parcelBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: { marginBottom: 16 },
  runFeature: {
    backgroundColor: "#102A43",
    borderRadius: 20,
    padding: 24,
    marginTop: 12,
    marginBottom: 20,
  },
  runEyebrow: {
    fontFamily: "Manrope",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    color: "#53E0BA",
  },
  runTitle: {
    fontFamily: "Manrope",
    fontSize: 28,
    lineHeight: 37,
    letterSpacing: -0.5,
    color: "#F7F8F4",
    fontWeight: "700",
    marginTop: 24,
  },
  runBody: {
    fontFamily: "Manrope",
    fontSize: 14,
    lineHeight: 23,
    color: "#B8C8D2",
    marginTop: 12,
    maxWidth: 330,
  },
  runLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderColor: "#2B485A",
  },
  runLinkText: {
    fontFamily: "Manrope",
    color: "#53E0BA",
    fontSize: 14,
    fontWeight: "700",
  },
  amount: {
    fontFamily: "Manrope",
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  tabBar: {
    borderTopWidth: 1,
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 26 : 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 5,
  },
  tabLabel: { fontFamily: "Manrope", fontSize: 12 },
  notice: {
    fontFamily: "Manrope",
    padding: 14,
    borderWidth: 1,
    borderColor: "#53E0BA",
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 22,
  },
  field: { marginTop: 12 },
  timeline: { paddingVertical: 16 },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 34,
  },
  timelineDot: { width: 12, height: 12, borderRadius: 6 },
  auth: {
    padding: 28,
    paddingTop: 48,
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
    flexGrow: 1,
    justifyContent: "center",
  },
  authBrand: {
    backgroundColor: "#102A43",
    width: 112,
    height: 112,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  authTitle: {
    fontFamily: "Manrope",
    fontSize: 36,
    lineHeight: 46,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 12,
    marginBottom: 12,
  },
  authFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 24,
  },
  currencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
});
type RunParcel =
  import("../generated/graphql").RunParcelsQuery["runParcels"][number];
function RunDetail({
  run,
  returns,
  onChange,
}: {
  run: Run;
  returns: Return[];
  onChange: () => Promise<void>;
}) {
  const api = useApi(),
    theme = useTheme();
  const [parcels, setParcels] = useState<RunParcel[]>([]),
    [selected, setSelected] = useState(""),
    [stop, setStop] = useState(""),
    [evidence, setEvidence] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      const d = await api.request<{ runParcels: RunParcel[] }>(
        "query Parcels($runId:String!){runParcels(runId:$runId){returnId item label carrier state stopName position handedOverAt evidenceNote}}",
        { runId: run.id },
      );
      setParcels(d.runParcels);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [run.id]);
  async function mutate(operation: string, variables: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api.request(operation, variables);
      await load();
      await onChange();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Text variant="headlineSmall">{run.name}</Text><ReminderForm scope={{runId:run.id}} kinds={['run']}/>
      <Caption>{new Date(run.plannedAt).toLocaleString()}</Caption>
      <Caption>
        Manually organised stops. Confirm each location accepts your carrier and
        return method before travelling.
      </Caption>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}
      {parcels.map((p, i) => (
        <Surface key={p.returnId}>
          <Caption>
            STOP {p.position + 1} · {p.stopName}
          </Caption>
          <Text variant="titleMedium">{p.item}</Text>
          <Caption>
            {p.carrier} · {p.state.replaceAll("_", " ")}
          </Caption>
          <Text selectable style={styles.top}>
            Label: {p.label || "Missing — prepare this parcel first"}
          </Text>
          {p.handedOverAt ? (
            <Caption>
              Handed over {new Date(p.handedOverAt).toLocaleString()} ·{" "}
              {p.evidenceNote}
            </Caption>
          ) : (
            <>
              <Field
                label="Handover evidence / receipt reference"
                value={evidence[p.returnId] || ""}
                onChangeText={(v) =>
                  setEvidence((old) => ({ ...old, [p.returnId]: v }))
                }
              />
              <Button
                mode="contained"
                disabled={
                  busy || p.state !== "packed" || !evidence[p.returnId]?.trim()
                }
                style={styles.top}
                onPress={() =>
                  mutate(
                    "mutation Handover($runId:String!,$returnId:String!,$evidenceNote:String!){completeRunStop(runId:$runId,returnId:$returnId,evidenceNote:$evidenceNote)}",
                    {
                      runId: run.id,
                      returnId: p.returnId,
                      evidenceNote: evidence[p.returnId],
                    },
                  )
                }
              >
                Confirm this parcel handed over
              </Button>
            </>
          )}
          <Button
            textColor={theme.colors.onSurface}
            icon="navigation-outline"
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.stopName)}`,
              ).catch((e) => setError(message(e)))
            }
          >
            Open location in maps
          </Button>
          {i > 0 && !p.handedOverAt && (
            <Button
              disabled={busy}
              textColor={theme.colors.onSurface}
              onPress={() =>
                mutate(
                  "mutation Move($runId:String!,$returnId:String!,$stopName:String!,$position:Int!){assignParcelToRun(runId:$runId,returnId:$returnId,stopName:$stopName,position:$position)}",
                  {
                    runId: run.id,
                    returnId: p.returnId,
                    stopName: p.stopName,
                    position: Math.max(0, p.position - 1),
                  },
                )
              }
            >
              Move stop earlier
            </Button>
          )}
        </Surface>
      ))}
      {!parcels.length && (
        <Caption>No parcels assigned. Select a return below.</Caption>
      )}
      <Text variant="titleMedium" style={styles.top}>
        Add a parcel
      </Text>
      <View style={styles.currencyRow}>
        {returns
          .filter(
            (r) =>
              ["requested", "packed"].includes(r.state) &&
              !parcels.some((p) => p.returnId === r.id),
          )
          .map((r) => (
            <Chip
              key={r.id}
              selected={selected === r.id}
              onPress={() => setSelected(r.id)}
            >
              {r.item}
            </Chip>
          ))}
      </View>
      <Field
        label="Saved drop-off location / address"
        value={stop}
        onChangeText={setStop}
      />
      <Button
        mode="outlined"
        textColor={theme.colors.onSurface}
        disabled={busy || !selected || !stop.trim()}
        style={styles.top}
        onPress={async () => {
          await mutate(
            "mutation Assign($runId:String!,$returnId:String!,$stopName:String!,$position:Int!){assignParcelToRun(runId:$runId,returnId:$returnId,stopName:$stopName,position:$position)}",
            {
              runId: run.id,
              returnId: selected,
              stopName: stop,
              position: parcels.length,
            },
          );
          setSelected("");
          setStop("");
        }}
      >
        Assign parcel to this outing
      </Button>
    </>
  );
}
function ExportData() {
  const api = useApi(),
    theme = useTheme();
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        mode="outlined"
        textColor={theme.colors.onSurface}
        style={styles.top}
        loading={busy}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const d = await api.request<{ exportData: string }>(
              "query { exportData }",
            );
            setText(d.exportData);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Export my account data
      </Button>
      {!!text && (
        <Surface>
          <Caption>
            Select and copy your JSON export. Store it somewhere private.
          </Caption>
          <Text selectable style={{ fontFamily: "monospace", fontSize: 12 }}>
            {text}
          </Text>
          <Button
            onPress={() => setText("")}
            textColor={theme.colors.onSurface}
          >
            Hide export
          </Button>
        </Surface>
      )}
      {!!error && <Text style={{ color: theme.colors.error }}>{error}</Text>}
    </>
  );
}
type PurchaseItem = {
  id: string;
  name: string;
  unitAmountMinor: string;
  quantity: number;
  returnedQuantity: number;
};
function PartialReturnPicker({
  purchase,
  onChange,
  onOpen,
  existing,
}: {
  purchase: Purchase;
  onChange: () => Promise<void>;
  onOpen: (r: Return) => void;
  existing: Return[];
}) {
  const api = useApi(),
    theme = useTheme();
  const [items, setItems] = useState<PurchaseItem[]>([]),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .request<{ purchaseItems: PurchaseItem[] }>(
        "query Items($purchaseId:String!){purchaseItems(purchaseId:$purchaseId){id name unitAmountMinor quantity returnedQuantity}}",
        { purchaseId: purchase.id },
      )
      .then((d) => setItems(d.purchaseItems))
      .catch((e) => setError(message(e)));
  }, [purchase.id]);
  return (
    <View style={styles.top}>
      <Text variant="titleMedium">Items in this order</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.top}>
          <Text style={styles.semibold}>{item.name}</Text>
          <Caption>
            {money(item.unitAmountMinor, purchase.currency)} each ·{" "}
            {item.returnedQuantity} of {item.quantity} already selected for
            returns
          </Caption>
          {item.quantity > item.returnedQuantity && (
            <Field
              label={`Quantity to return (0–${item.quantity - item.returnedQuantity})`}
              value={quantities[item.id] || "0"}
              onChangeText={(v) =>
                setQuantities((old) => ({ ...old, [item.id]: v }))
              }
              keyboardType="number-pad"
            />
          )}
        </View>
      ))}
      {existing.map((r) => (
        <Button
          key={r.id}
          textColor={theme.colors.onSurface}
          onPress={() => onOpen(r)}
        >
          Open {r.state.replaceAll("_", " ")} return ·{" "}
          {money(r.expectedMinor, r.currency)}
        </Button>
      ))}
      {!!error && <Text style={{ color: theme.colors.error }}>{error}</Text>}
      {items.some((i) => i.returnedQuantity < i.quantity) && (
        <Button
          mode="contained"
          style={styles.top}
          disabled={busy}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError("");
            try {
              const selected = items
                .filter((i) => Number(quantities[i.id] || 0) > 0)
                .map((i) => {
                  const value = quantities[i.id];
                  if (
                    !/^\d+$/.test(value) ||
                    Number(value) > i.quantity - i.returnedQuantity
                  )
                    throw Error("Choose valid item quantities.");
                  return { itemId: i.id, quantity: Number(value) };
                });
              if (!selected.length)
                throw Error("Select at least one item to return.");
              await api.request(
                "mutation Partial($purchaseId:String!,$items:[ReturnItemInput!]!,$category:Int!,$method:Int!){startPartialReturn(purchaseId:$purchaseId,items:$items,category:$category,method:$method)}",
                {
                  purchaseId: purchase.id,
                  items: selected,
                  category: 3,
                  method: 2,
                },
              );
              await onChange();
              const d = await api.request<{ purchaseItems: PurchaseItem[] }>(
                "query Items($purchaseId:String!){purchaseItems(purchaseId:$purchaseId){id name unitAmountMinor quantity returnedQuantity}}",
                { purchaseId: purchase.id },
              );
              setItems(d.purchaseItems);
              setQuantities({});
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Start return for selected items
        </Button>
      )}
    </View>
  );
}
function FeeForm({
  returnId,
  currency,
  onChange,
}: {
  returnId: string;
  currency: string;
  onChange: () => Promise<void>;
}) {
  const api = useApi(),
    theme = useTheme();
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Field
        label={`Explicit return fee (${currency})`}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
      />
      <Button
        disabled={busy || !value}
        loading={busy}
        textColor={theme.colors.onSurface}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await api.request(
              "mutation Fee($returnId:String!,$amountMinor:String!){recordFee(returnId:$returnId,amountMinor:$amountMinor)}",
              { returnId, amountMinor: minor(value, currency) },
            );
            setValue("");
            await onChange();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Record confirmed fee
      </Button>
      {!!error && <Text style={{ color: theme.colors.error }}>{error}</Text>}
    </>
  );
}
type DocumentRecord = {
  id: string;
  purpose: string;
  contentType: string;
  status: string;
  byteLength: string;
};
function Documents({
  purchaseId,
  returnId,
}: {
  purchaseId?: string;
  returnId?: string;
}) {
  const api = useApi(),
    theme = useTheme();
  const [docs, setDocs] = useState<DocumentRecord[]>([]),
    [pending, setPending] = useState<{
      uri: string;
      name: string;
      contentType: string;
      size: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState("");
  async function load() {
    try {
      const d = await api.request<{ documents: DocumentRecord[] }>(
        "query Documents($purchaseId:String,$returnId:String){documents(purchaseId:$purchaseId,returnId:$returnId){id purpose contentType status byteLength}}",
        { purchaseId, returnId },
      );
      setDocs(d.documents);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [purchaseId, returnId]);
  async function pick(photo: boolean) {
    setError("");
    try {
      if (photo) {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError(
            "Photo access was denied. You can choose a PDF instead or allow photo access in system settings.",
          );
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 1,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        const type = asset.mimeType || "image/jpeg";
        const size =
          asset.fileSize || (await (await fetch(asset.uri)).blob()).size;
        setPending({
          uri: asset.uri,
          name: asset.fileName || "receipt-photo",
          contentType: type,
          size,
        });
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/jpeg", "image/png"],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        setPending({
          uri: asset.uri,
          name: asset.name,
          contentType: asset.mimeType || "application/pdf",
          size: asset.size || (await (await fetch(asset.uri)).blob()).size,
        });
      }
    } catch (e) {
      setError(message(e));
    }
  }
  async function upload() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      if (pending.size > 10 * 1024 * 1024)
        throw Error("Choose a file no larger than 10 MiB.");
      const data = await api.request<{
        beginDocumentUpload: {
          documentId: string;
          url: string;
          contentType: string;
          byteLength: string;
        };
      }>(
        "mutation Begin($purchaseId:String,$returnId:String,$purpose:String!,$contentType:String!,$byteLength:String!){beginDocumentUpload(purchaseId:$purchaseId,returnId:$returnId,purpose:$purpose,contentType:$contentType,byteLength:$byteLength){documentId url contentType byteLength}}",
        {
          purchaseId,
          returnId,
          purpose: purchaseId ? "receipt" : "return_evidence",
          contentType: pending.contentType,
          byteLength: pending.size.toString(),
        },
      );
      const grant = data.beginDocumentUpload;
      const blob = await (await fetch(pending.uri)).blob();
      const response = await fetch(grant.url, {
        method: "PUT",
        headers: { "Content-Type": grant.contentType },
        body: blob,
      });
      if (!response.ok)
        throw Error(
          `Document upload failed (${response.status}). Your file is still selected; retry when connected.`,
        );
      await api.request(
        "mutation Finish($documentId:String!){finishDocumentUpload(documentId:$documentId)}",
        { documentId: grant.documentId },
      );
      setPending(null);
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.top}>
      <Divider />
      <Text variant="titleMedium" style={styles.top}>
        {purchaseId ? "Receipts & documents" : "Return documents & evidence"}
      </Text>
      <Caption>
        Private files use scoped upload and download links. Choose PDF, JPEG or
        PNG up to 10 MiB. Keep this screen open while a file is pending.
      </Caption>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}
      {docs.map((doc) => (
        <Surface key={doc.id}>
          <Text>
            {doc.purpose.replaceAll("_", " ")} · {doc.status}
          </Text>
          <Caption>
            {doc.contentType} · {doc.byteLength} bytes
          </Caption>
          {doc.status === "ready" && (
            <Button
              textColor={theme.colors.onSurface}
              onPress={async () => {
                try {
                  const d = await api.request<{ documentDownloadUrl: string }>(
                    "query Download($documentId:String!){documentDownloadUrl(documentId:$documentId)}",
                    { documentId: doc.id },
                  );
                  await Linking.openURL(d.documentDownloadUrl);
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              Open private document
            </Button>
          )}
          <Button
            textColor={theme.colors.error}
            disabled={busy}
            onPress={async () => {
              if (deleting !== doc.id) {
                setDeleting(doc.id);
                return;
              }
              setBusy(true);
              try {
                await api.request(
                  "mutation Delete($documentId:String!){deleteDocument(documentId:$documentId)}",
                  { documentId: doc.id },
                );
                setDeleting("");
                await load();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {deleting === doc.id
              ? "Confirm document deletion"
              : "Delete document"}
          </Button>
        </Surface>
      ))}
      {pending && (
        <Surface>
          <Text>{pending.name}</Text>
          <Caption>
            Pending upload · {pending.size} bytes. Not saved to the server yet.
          </Caption>
          <Button
            mode="contained"
            disabled={busy}
            loading={busy}
            onPress={upload}
          >
            Upload selected file / retry
          </Button>
          <Button
            disabled={busy}
            textColor={theme.colors.onSurface}
            onPress={() => setPending(null)}
          >
            Discard selected file
          </Button>
        </Surface>
      )}
      <View style={styles.currencyRow}>
        <Button
          disabled={busy}
          textColor={theme.colors.onSurface}
          icon="file-document-outline"
          onPress={() => pick(false)}
        >
          Choose PDF / file
        </Button>
        <Button
          disabled={busy}
          textColor={theme.colors.onSurface}
          icon="image-outline"
          onPress={() => pick(true)}
        >
          Choose photo
        </Button>
      </View>
    </View>
  );
}
function PurchaseEditor({purchase,onChange}:{purchase:Purchase;onChange:()=>Promise<void>}){const api=useApi(),theme=useTheme();const [editing,setEditing]=useState(false),[merchant,setMerchant]=useState(purchase.merchant),[item,setItem]=useState(purchase.item),[deadline,setDeadline]=useState(purchase.deadline),[notes,setNotes]=useState(purchase.notes),[version,setVersion]=useState(purchase.version),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);return <View style={styles.top}><Button textColor={theme.colors.onSurface} onPress={()=>setEditing(v=>!v)}>{editing?'Hide editing':'Edit purchase details'}</Button>{editing&&<><Field label="Merchant" value={merchant} onChangeText={setMerchant}/><Field label="Order display name" value={item} onChangeText={setItem}/><Field label="Confirmed decision deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline}/><Field label="Notes" value={notes} onChangeText={setNotes} multiline/><Button disabled={busy} loading={busy} mode="contained" style={styles.top} onPress={async()=>{setBusy(true);try{await api.request('mutation Update($purchaseId:String!,$version:Int!,$merchant:String!,$item:String!,$deadline:String!,$notes:String!){updatePurchase(purchaseId:$purchaseId,version:$version,merchant:$merchant,item:$item,deadline:$deadline,notes:$notes)}',{purchaseId:purchase.id,version,merchant,item,deadline,notes});setVersion(v=>v+1);await onChange();setEditing(false)}catch(e){setError(message(e))}finally{setBusy(false)}}}>Save changes</Button><Caption>Amounts and order items are fixed in this build. Version checks prevent overwriting newer changes.</Caption></>}{!!error&&<Text style={{color:theme.colors.error}}>{error}</Text>}<Button disabled={busy} textColor={theme.colors.error} onPress={async()=>{if(!confirm){setConfirm(true);return}setBusy(true);try{await api.request('mutation Delete($purchaseId:String!,$version:Int!){deletePurchase(purchaseId:$purchaseId,version:$version)}',{purchaseId:purchase.id,version});await onChange();setError('Purchase deleted. Close this detail screen.')}catch(e){setError(message(e))}finally{setBusy(false)}}}>{confirm?'Confirm permanent purchase deletion':'Delete purchase (before returning)'}</Button></View>}
function FollowupTemplate({record}:{record:Return}) {
 const original=`Hello ${record.merchant} team,\n\nI’m following up on my return of ${record.item}. I have received ${money(record.receivedMinor,record.currency)}. The remaining balance recorded in my return tracker is ${money(record.remainingMinor,record.currency)}. Please confirm the refund status and any next steps.\n\nThank you.`;
 const [draft,setDraft]=useState(original);
 return <View style={styles.top}><Text variant="titleMedium">Refund follow-up message</Text><Caption>Editable template based on your records. Check references and amounts, then select and copy the text to contact the merchant yourself.</Caption><Field label="Follow-up message" multiline value={draft} onChangeText={setDraft}/><Button onPress={()=>setDraft(original)}>Reset template</Button></View>
}
function ReminderForm({scope,kinds}:{scope:{purchaseId?:string;returnId?:string;runId?:string};kinds:string[]}){const api=useApi(),theme=useTheme();const [kind,setKind]=useState(kinds[0]),[when,setWhen]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);return <View style={styles.top}><Text variant="titleMedium">Schedule a reminder</Text><View style={styles.currencyRow}>{kinds.map(k=><Chip key={k} selected={kind===k} onPress={()=>setKind(k)}>{k}</Chip>)}</View><Field label="Reminder date/time with timezone (ISO 8601)" value={when} onChangeText={setWhen}/><Caption>Server-scheduled reminder. Enter an exact instant, for example 2026-11-12T17:30:00+01:00. Quiet hours may delay notification.</Caption><Button textColor={theme.colors.onSurface} disabled={busy} loading={busy} onPress={async()=>{setBusy(true);try{if(!/[+-]\d\d:\d\d$|Z$/.test(when)||Number.isNaN(Date.parse(when)))throw Error('Enter a valid date/time with its timezone offset.');await api.request('mutation Reminder($purchaseId:String,$returnId:String,$runId:String,$kind:String!,$dueAt:String!){scheduleReminder(purchaseId:$purchaseId,returnId:$returnId,runId:$runId,kind:$kind,dueAt:$dueAt)}',{...scope,kind,dueAt:new Date(when).toISOString()});setStatus('Reminder saved on the server. Push delivery depends on permissions and configured credentials.')}catch(e){setStatus(message(e))}finally{setBusy(false)}}}>Save server reminder</Button>{!!status&&<Text accessibilityLiveRegion="polite">{status}</Text>}</View>}
type NotificationItem={id:string;title:string;body:string;deepLink:string;createdAt:string;read:boolean};
function NotificationCentre({onDeepLink}:{onDeepLink:(v:string)=>void}){const api=useApi(),theme=useTheme();const [rows,setRows]=useState<NotificationItem[]>([]),[timezone,setTimezone]=useState(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'),[enabled,setEnabled]=useState(false),[start,setStart]=useState('22'),[end,setEnd]=useState('8'),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);async function load(){try{const d=await api.request<{notifications:NotificationItem[];notificationPreferences:{timezone:string;pushEnabled:boolean;quietStart:number;quietEnd:number}}>('query Notifications {notifications{id title body deepLink createdAt read} notificationPreferences{timezone pushEnabled quietStart quietEnd}}');setRows(d.notifications);setTimezone(d.notificationPreferences.timezone);setEnabled(d.notificationPreferences.pushEnabled);setStart(String(d.notificationPreferences.quietStart));setEnd(String(d.notificationPreferences.quietEnd))}catch(e){setStatus(message(e))}}useEffect(()=>{void Promise.resolve().then(load)},[]);return <Surface><Text variant="titleLarge">Notifications</Text><Caption>Remote reminders are scheduled by the server. This build does not schedule duplicate local reminders.</Caption><View style={styles.sectionRow}><Text>Allow server push attempts</Text><Switch value={enabled} onValueChange={setEnabled} accessibilityLabel="Allow server push attempts"/></View><Field label="IANA timezone" value={timezone} onChangeText={setTimezone}/><View style={styles.row}><View style={{flex:1}}><Field label="Quiet start hour (0–23)" value={start} onChangeText={setStart} keyboardType="number-pad"/></View><View style={{flex:1}}><Field label="Quiet end hour (0–23)" value={end} onChangeText={setEnd} keyboardType="number-pad"/></View></View><Button disabled={busy} loading={busy} textColor={theme.colors.onSurface} onPress={async()=>{setBusy(true);try{if(!/^\d{1,2}$/.test(start)||!/^\d{1,2}$/.test(end)||Number(start)>23||Number(end)>23)throw Error('Quiet hours must be whole hours between 0 and 23.');await api.request('mutation Preferences($timezone:String!,$pushEnabled:Boolean!,$quietStart:Int!,$quietEnd:Int!){updateNotificationPreferences(timezone:$timezone,pushEnabled:$pushEnabled,quietStart:$quietStart,quietEnd:$quietEnd)}',{timezone,pushEnabled:enabled,quietStart:Number(start),quietEnd:Number(end)});setStatus('Notification preferences saved.')}catch(e){setStatus(message(e))}finally{setBusy(false)}}}>Save preferences</Button><Button disabled={busy} textColor={theme.colors.onSurface} onPress={async()=>{setBusy(true);try{if(Platform.OS==='web')throw Error('Push registration requires a native development build and a physical device.');const projectId=process.env.EXPO_PUBLIC_EAS_PROJECT_ID||Constants.expoConfig?.extra?.eas?.projectId;if(!projectId)throw Error('Configure EXPO_PUBLIC_EAS_PROJECT_ID and native push credentials before device registration.');const permissions=await Notifications.requestPermissionsAsync();if(!permissions.granted)throw Error('Notification permission denied. Enable it in system settings to receive push reminders.');const token=await Notifications.getExpoPushTokenAsync({projectId});await api.request('mutation Device($token:String!){registerDeviceToken(token:$token)}',{token:token.data});setStatus('Device token registered. Provider acceptance and device delivery have not been verified.')}catch(e){setStatus(message(e))}finally{setBusy(false)}}}>Enable notifications on this device</Button>{!!status&&<Text accessibilityLiveRegion="polite">{status}</Text>}<Divider style={styles.top}/><Text variant="titleMedium" style={styles.top}>Notification history</Text><Button textColor={theme.colors.onSurface} onPress={load}>Refresh history</Button>{!rows.length&&<Caption>No notifications yet.</Caption>}{rows.map(n=><Pressable key={n.id} accessibilityRole="button" onPress={async()=>{try{await api.request('mutation Read($notificationId:String!){markNotificationRead(notificationId:$notificationId)}',{notificationId:n.id});onDeepLink(n.deepLink);await load()}catch(e){setStatus(message(e))}}} style={styles.top}><Text style={styles.semibold}>{n.read?'':'Unread · '}{n.title}</Text><Caption>{n.body}</Caption><Caption>{new Date(n.createdAt).toLocaleString()}</Caption></Pressable>)}</Surface>}
