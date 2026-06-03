/**
 * Rodeo Mobile — a minimal chat client for talking to your offline brain on the go.
 *
 * It talks DIRECTLY to Ollama's native /api/chat on your Mac-at-home over a
 * Tailscale tunnel — no Next.js server, no API key, nothing to expose publicly.
 * Just `ollama serve` on the Mac (already running) + Tailscale on both devices.
 *
 * Set the Ollama URL in Settings to your Mac's Tailscale address, e.g.
 *   http://100.x.y.z:11434
 *
 * Run: `cd mobile && npm install && npx expo start` (Expo Go on your phone).
 * NOTE: scaffold — built without a device to test on; refine as needed.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, SafeAreaView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const DEFAULTS = { url: "http://localhost:11434", model: "qwen2.5:14b" };

export default function App() {
  const [url, setUrl] = useState(DEFAULTS.url);
  const [model, setModel] = useState(DEFAULTS.model);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const listRef = useRef<FlatList>(null);

  // Load saved settings.
  useEffect(() => {
    (async () => {
      const u = await AsyncStorage.getItem("rodeo.url");
      const m = await AsyncStorage.getItem("rodeo.model");
      if (u) setUrl(u);
      if (m) setModel(m);
      if (!u) setShowSettings(true); // first run → prompt for the Mac's address
    })();
  }, []);

  async function saveSettings() {
    const u = draftUrl.trim() || DEFAULTS.url;
    const m = draftModel.trim() || DEFAULTS.model;
    setUrl(u); setModel(m);
    await AsyncStorage.setItem("rodeo.url", u);
    await AsyncStorage.setItem("rodeo.model", m);
    setShowSettings(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: next,
          stream: false,
          keep_alive: "30m",
          options: { temperature: 0.3, num_ctx: 8192 },
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = await res.json();
      const reply = data?.message?.content || "(no response)";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠ Couldn't reach Rodeo at ${url}.\n${e.message}\n\nCheck: Mac is on, \`ollama serve\` running, Tailscale connected, and the URL in Settings (⚙) is your Mac's Tailscale address.` }]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>🐎 Rodeo</Text>
        <Text style={styles.sub}>{model} · offline brain</Text>
        <TouchableOpacity onPress={() => { setDraftUrl(url); setDraftModel(model); setShowSettings(true); }}>
          <Text style={styles.gear}>⚙</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88}>
        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
              <Text style={item.role === "user" ? styles.userText : styles.assistantText}>{item.content}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Ask Rodeo anything. Runs on your Mac, reachable over Tailscale.</Text>}
        />
        {busy && <ActivityIndicator color="#7c5cff" style={{ marginBottom: 6 }} />}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Rodeo…"
            placeholderTextColor="#666"
            multiline
            onSubmitEditing={send}
          />
          <TouchableOpacity style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]} onPress={send} disabled={!input.trim() || busy}>
            <Text style={styles.sendText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Settings</Text>
            <Text style={styles.label}>Ollama URL (your Mac's Tailscale address)</Text>
            <TextInput style={styles.modalInput} value={draftUrl} onChangeText={setDraftUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://100.x.y.z:11434" placeholderTextColor="#666" />
            <Text style={styles.label}>Model</Text>
            <TextInput style={styles.modalInput} value={draftModel} onChangeText={setDraftModel} autoCapitalize="none" autoCorrect={false} placeholder="qwen2.5:14b" placeholderTextColor="#666" />
            <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0d0d0f" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomColor: "#222", borderBottomWidth: 1 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  sub: { color: "#888", fontSize: 12, marginLeft: 10, flex: 1 },
  gear: { color: "#aaa", fontSize: 20 },
  list: { flex: 1 },
  bubble: { maxWidth: "85%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  user: { alignSelf: "flex-end", backgroundColor: "#7c5cff" },
  assistant: { alignSelf: "flex-start", backgroundColor: "#1a1a1f" },
  userText: { color: "#fff", fontSize: 15 },
  assistantText: { color: "#e7e7ea", fontSize: 15 },
  empty: { color: "#555", textAlign: "center", marginTop: 60, paddingHorizontal: 30 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8, borderTopColor: "#222", borderTopWidth: 1 },
  input: { flex: 1, color: "#fff", backgroundColor: "#1a1a1f", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#7c5cff", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: "#16161a", borderRadius: 16, padding: 20, gap: 8 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  label: { color: "#999", fontSize: 12, marginTop: 8 },
  modalInput: { color: "#fff", backgroundColor: "#0d0d0f", borderRadius: 10, padding: 12, borderColor: "#2a2a30", borderWidth: 1, fontSize: 15 },
  saveBtn: { backgroundColor: "#7c5cff", borderRadius: 10, padding: 13, alignItems: "center", marginTop: 14 },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
