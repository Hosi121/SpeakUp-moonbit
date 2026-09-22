import { useMemo, useRef, useEffect } from "react";
import { createSession, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { mediaPorts } from "../../services/media";
import { realtimePorts } from "../../services/realtime";
import { useActivity } from "../../services/activity";
import { HalfModal } from "../utils/HalfModal";
import { Input } from "../ui/Field";
import { Avatar } from "../ui/Avatar";
import { ChoiceGroup } from "../ui/ChoiceGroup";
import { SessionBottomNavigationTemplate } from "../templates/SessionBottomNavigationTemplate";
import SessionContainer from "../utils/SessionContainer";
import { Redirect } from "../../navigation/links";
import { navigate, useLocation } from "../../navigation/location";
import { TopicPopup } from "../utils/TopicPopup";

export const Session = () => {
  const raw = useLocation().searchParams.get("conversation") ?? "";
  return <ConversationSession key={raw} raw={raw} />;
};
const ConversationSession = ({ raw }: { raw: string }) => {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const controller = useMemo(
    () =>
      createSession(
        browserPorts(),
        realtimePorts(),
        mediaPorts(() => remoteAudioRef.current),
        raw,
      ),
    [raw],
  );
  const view = useController(controller);
  const { clockOffset } = useActivity();
  useEffect(
    () => controller.set_offset(clockOffset),
    [controller, clockOffset],
  );
  const {
    muted: isMuted,
    speaking: isSpeak,
    remote_speaking: isOpponentSpeak,
    error: callError,
    saving,
    memo_open: memoOpen,
    assistant_open: assistantOpen,
    topic_open: showTopicPopup,
    memo_tab: value,
    carryInMemo,
    wordList,
    messages,
    draft: inputMessage,
    sending: isLoading,
    me,
    partner,
  } = view;
  const conversation = view.conversation[0];
  const {
    toggle_mute: toggleMute,
    set_tab: setValue,
    set_draft: setInputMessage,
    send: handleSendMessage,
    finish,
    cancel,
  } = controller;
  const setMemoOpen = (open: boolean) => controller.set_open("memo", open);
  const setAssistantOpen = (open: boolean) =>
    controller.set_open("assistant", open);
  const handleMemoClose = () => setMemoOpen(false);
  const handleAssistantClose = () => setAssistantOpen(false);
  const handleCloseTopicPopup = () => controller.set_open("topic", false);
  const handlePriorityHighClick = () => controller.set_open("topic", true);
  const users = [
    {
      name: me.username,
      icon: <Avatar src={me.avatarUrl} name={me.username} large />,
    },
    {
      name: partner.username,
      icon: <Avatar src={partner.avatar_url} name={partner.username} large />,
    },
  ];
  if (!view.id) return <Redirect to="/sessionlist" />;
  return (
    <SessionBottomNavigationTemplate
      isMute={isMuted}
      toggleMute={toggleMute}
      setMemoOpen={setMemoOpen}
      setAssistantOpen={setAssistantOpen}
      onPriorityHighClick={handlePriorityHighClick}
    >
      <SessionContainer
        theme={conversation?.theme ?? "読み込み中"}
        users={users}
        isSpeak={isSpeak && !isMuted}
        isOpponentSpeak={isOpponentSpeak}
      />
      <section className="stack compact center">
        <p role="status" className="numeric">
          {view.status}
        </p>
        {view.can_finish && (
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={() => void finish()}
          >
            通話を終了して記録する
          </button>
        )}
        {view.can_cancel && (
          <button type="button" disabled={saving} onClick={() => void cancel()}>
            通話の予定を取り消す
          </button>
        )}
        {view.can_retry && (
          <button type="button" onClick={controller.retry}>
            再接続
          </button>
        )}
        <button type="button" onClick={() => navigate("/sessionlist")}>
          通話一覧へ戻る
        </button>
      </section>
      <TopicPopup
        isVisible={showTopicPopup}
        onClose={handleCloseTopicPopup}
        topics={conversation?.topics ?? []}
      />
      <HalfModal open={memoOpen} handleClose={handleMemoClose} title="メモ">
        <div className="stack">
          <ChoiceGroup
            label="表示するメモ"
            value={value}
            onChange={setValue}
            options={[
              { value: "1", label: "持ち込みメモ" },
              { value: "2", label: "ワードリスト" },
            ]}
          />
          <p className="pre-wrap">
            {(value === "1" ? carryInMemo : wordList) ||
              "まだメモがありません。"}
          </p>
        </div>
      </HalfModal>
      <HalfModal
        open={assistantOpen}
        handleClose={handleAssistantClose}
        title="アシスタント"
      >
        <div
          className="chat-log stack compact"
          role="log"
          aria-label="アシスタントとの会話"
        >
          <p className="chat-bubble">何かお困りですか？</p>
          {messages.map((message, index) => (
            <p key={index} className="chat-bubble" data-own={message.own}>
              {message.body}
            </p>
          ))}
        </div>
        <form
          className="row search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSendMessage();
          }}
        >
          <Input
            label="メッセージを入力"
            value={inputMessage}
            onChange={(event) => setInputMessage(event.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="primary" disabled={isLoading}>
            {isLoading ? "送信中..." : "送信"}
          </button>
        </form>
      </HalfModal>
      <audio
        className="call-audio"
        ref={remoteAudioRef}
        autoPlay
        controls
        aria-label="相手の音声"
      />
      {callError && (
        <p role="alert" className="alert">
          {callError}
        </p>
      )}
    </SessionBottomNavigationTemplate>
  );
};

export default Session;
