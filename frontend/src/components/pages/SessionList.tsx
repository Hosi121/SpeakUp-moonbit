import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { conversationClock, conversationPartner, type ConversationDto } from "../../../../dist/shared.js";
import { createDirectConversation, fetchConversations } from "../../services/conversationService";
import { fetchUserProfile, searchUsers } from "../../services/userService";
import type { User, UserProfile } from "../../types/types";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";

export const SessionList = () => {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<ConversationDto[]>([]);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestIds = useRef(new Map<number, string>());
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [next, profile] = await Promise.all([fetchConversations(), fetchUserProfile()]);
      setCalls(next); setMe(profile); setLoaded(true);
    } catch (error) { setError(error instanceof Error ? error.message : "一覧を取得できませんでした"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setError("");
    try { setUsers((await searchUsers(query.trim())).filter(user => user.id !== me?.id)); }
    catch (error) { setError(error instanceof Error ? error.message : "検索できませんでした"); }
    finally { setBusy(false); }
  };
  const invite = async (user: User) => {
    setBusy(true); setError("");
    const key = requestIds.current.get(user.id) ?? crypto.randomUUID();
    requestIds.current.set(user.id, key);
    try {
      const conversation = await createDirectConversation(user.id, key);
      navigate(`/session?conversation=${conversation.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "通話を作成できませんでした"); }
    finally { setBusy(false); }
  };
  return <BottomNavigationTemplate value="session">
    <Container sx={{ py: 3, pb: 12 }}>
      <TopSection />
      <Stack spacing={3} sx={{ mt: 3 }}>
        <Typography variant="h4" component="h1">通話</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2">相手を選んで通話する</Typography>
          <Typography>相手が一覧から参加すると通話が始まります。</Typography>
          <Box component="form" onSubmit={event => { event.preventDefault(); void search(); }} sx={{ display: "flex", gap: 1, mt: 2 }}>
            <TextField label="ユーザー名を検索" value={query} onChange={event => setQuery(event.target.value)} fullWidth />
            <Button type="submit" disabled={busy || !me || !query.trim()}>検索</Button>
          </Box>
          {users.map(user => <Box key={user.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
            <Typography>{user.username}</Typography>
            <Button disabled={busy} variant="contained" onClick={() => void invite(user)}>{user.username} と通話する</Button>
          </Box>)}
        </Paper>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6" component="h2">参加できる通話</Typography>
          <Button disabled={busy} onClick={() => void refresh()}>一覧を更新</Button>
        </Box>
        {loaded && calls.length === 0 && <Typography>参加できる通話はありません。</Typography>}
        {calls.map(call => {
          const clock = conversationClock(call, Date.now());
          const partner = me ? conversationPartner(call, me.id).username : "";
          return <Paper component="article" key={call.id} sx={{ p: 3 }}>
            <Typography variant="h6">{call.theme}</Typography>
            <Typography>{call.event_id ? `${new Date(call.event_start).toLocaleString()}・ラウンド ${call.round}` : "随時通話"}</Typography>
            <Typography>相手：{partner}</Typography>
            <Button variant="contained" disabled={!clock.can_join} onClick={() => navigate(`/session?conversation=${call.id}`)}>
              {clock.phase === "active" ? "再参加する" : "参加する"}
            </Button>
          </Paper>;
        })}
        <Button onClick={() => navigate("/conversation_history")}>会話の記録を見る</Button>
      </Stack>
    </Container>
  </BottomNavigationTemplate>;
};
