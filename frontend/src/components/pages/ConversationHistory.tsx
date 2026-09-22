import { useEffect, useState } from "react";
import { Alert, Button, Container, Paper, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { type ConversationDto } from "../../../../dist/shared.js";
import { fetchConversations } from "../../services/conversationService";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";

export const ConversationHistory = () => {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<ConversationDto[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    void fetchConversations(true).then(calls => { if (!disposed) { setCalls(calls); setLoaded(true); } })
      .catch(error => { if (!disposed) setError(error instanceof Error ? error.message : "履歴を取得できませんでした"); });
    return () => { disposed = true; };
  }, []);
  return <BottomNavigationTemplate value="other">
    <Container sx={{ py: 3, pb: 12 }}>
      <TopSection />
      <Stack spacing={3} sx={{ mt: 3 }}>
        <Typography variant="h4" component="h1">会話の記録</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {loaded && calls.length === 0 && <Typography>終了した会話はまだありません。</Typography>}
        {calls.map(call => <Paper component="article" key={call.id} sx={{ p: 3 }}>
          <Typography variant="h6">{call.theme}</Typography>
          <Typography>{call.participants.map(user => user.username).join(" / ")}</Typography>
          <Typography>{new Date(call.started_at).toLocaleString()}{call.event_id ? `・ラウンド ${call.round}` : "・随時通話"}</Typography>
          <Button onClick={() => navigate(`/sessionrecord?conversation=${call.id}`)}>振り返りを開く</Button>
        </Paper>)}
      </Stack>
    </Container>
  </BottomNavigationTemplate>;
};
