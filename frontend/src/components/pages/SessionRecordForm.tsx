import { useEffect, useState } from "react";
import { Alert, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { conversationClock, type ConversationDto } from "../../../../dist/shared.js";
import { fetchConversation, fetchReflection, saveReflection } from "../../services/conversationService";
import TopSection from "../utils/TopSection";

export default function SessionRecordForm() {
  const [query] = useSearchParams();
  const id = Number(query.get("conversation"));
  return Number.isInteger(id) && id > 0 && id <= 2147483647
    ? <RecordForm key={id} id={id} /> : <Navigate to="/conversation_history" replace />;
}
function RecordForm({ id }: { id: number }) {
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ConversationDto | null>(null);
  const [satisfaction, setSatisfaction] = useState("50");
  const [comment, setComment] = useState("");
  const [learned, setLearned] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let disposed = false;
    void Promise.all([fetchConversation(id), fetchReflection(id)]).then(([call, reflection]) => {
      if (disposed) return;
      setConversation(call); setSatisfaction(String(reflection.satisfaction));
      setComment(reflection.comment); setLearned(reflection.learned_expressions); setSaved(reflection.saved);
    }).catch(error => { if (!disposed) setError(error instanceof Error ? error.message : "記録を読み込めませんでした"); })
      .finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; };
  }, [id]);
  const complete = conversation && conversationClock(conversation, Date.now()).phase === "completed";
  const save = async () => {
    const rating = Number(satisfaction);
    if (satisfaction.trim() === "" || !Number.isInteger(rating) || rating < 0 || rating > 100) {
      setError("満足度は 0〜100 の整数で入力してください"); return;
    }
    setBusy(true); setError(""); setSaved(false);
    try {
      await saveReflection(id, { satisfaction: rating, comment, learned_expressions: learned });
      setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : "保存できませんでした"); }
    finally { setBusy(false); }
  };
  return <Container sx={{ py: 3 }}>
    <TopSection />
    <Stack spacing={3} sx={{ mt: 3 }}>
      <Typography variant="h4" component="h1">会話の振り返り</Typography>
      {conversation && <Paper sx={{ p: 3 }}>
        <Typography variant="h6">{conversation.theme}</Typography>
        <Typography>{conversation.participants.map(user => user.username).join(" / ")}</Typography>
        <Typography>{conversation.started_at ? new Date(conversation.started_at).toLocaleString() : "未開始"}</Typography>
      </Paper>}
      {error && <Alert severity="error">{error}</Alert>}
      {!busy && conversation && !complete && <Alert severity="info">通話が終了してから記録できます。</Alert>}
      {saved && <Alert severity="success">保存済みです。振り返りは本人だけが閲覧できます。</Alert>}
      <Paper component="form" sx={{ p: 3 }} onSubmit={event => { event.preventDefault(); void save(); }}>
        <Stack spacing={2}>
          <TextField label="満足度 (%)" type="number" value={satisfaction} onChange={event => { setSatisfaction(event.target.value); setSaved(false); }} inputProps={{ min: 0, max: 100, step: 1 }} disabled={busy || !complete} />
          <TextField label="感想" multiline rows={3} value={comment} onChange={event => { setComment(event.target.value); setSaved(false); }} inputProps={{ maxLength: 4000 }} disabled={busy || !complete} />
          <TextField label="学んだ表現" multiline rows={4} value={learned} onChange={event => { setLearned(event.target.value); setSaved(false); }} inputProps={{ maxLength: 8000 }} disabled={busy || !complete} />
          <Button type="submit" variant="contained" disabled={busy || !complete}>保存</Button>
        </Stack>
      </Paper>
      <Button onClick={() => navigate("/sessionlist")}>通話一覧へ</Button>
      <Button onClick={() => navigate("/conversation_history")}>会話の記録へ</Button>
    </Stack>
  </Container>;
}
