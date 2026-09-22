import {
  startVoiceCall,
  type VoiceConnectionState,
} from "../../services/voiceCall";
import { HalfModal } from "../utils/HalfModal";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "../ui/Field";
import { Avatar } from "../ui/Avatar";
import { ChoiceGroup } from "../ui/ChoiceGroup";
import { SessionBottomNavigationTemplate } from "../templates/SessionBottomNavigationTemplate";
import SessionContainer from "../utils/SessionContainer";
import { fetchMemo } from "../../services/memoService"; // Import the fetchMemo function
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { TopicPopup } from "../utils/TopicPopup";
import { AudioVolumeAnalyzer } from "../utils/AudioVolumeAnalyzer";
import { fetchUserProfile } from "../../services/userService";
import { askAssistant } from "../../services/chatService";
import {
  conversationClock,
  conversationPartner,
  type ConversationDto,
} from "../../../../dist/shared.js";
import {
  finishConversation,
  cancelConversation,
} from "../../services/conversationService";
import type { UserProfile } from "../../types/types";

export const Session = () => {
  const [query] = useSearchParams();
  const id = Number(query.get("conversation"));
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? (
    <ConversationSession key={id} id={id} />
  ) : (
    <Navigate to="/sessionlist" replace />
  );
};

const ConversationSession = ({ id }: { id: number }) => {
  const [memoOpen, setMemoOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false); // ローディング状態を管理
  const [carryInMemo, setCarryInMemo] = useState("");
  const [wordList, setWordList] = useState("");
  const [value, setValue] = useState("1");
  const [isMuted, setIsMuted] = useState(false);
  const mutedRef = useRef(false);
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ConversationDto | null>(
    null,
  );
  const [now, setNow] = useState(Date.now);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const ending = useRef(false);
  const automaticFinish = useRef(false);
  const [showTopicPopup, setShowTopicPopup] = useState(false);
  const clock = conversation ? conversationClock(conversation, now) : null;

  useEffect(() => {
    if (clock?.phase !== "active") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [clock?.phase]);

  useEffect(() => {
    // コンポーネント読み込み時にメモを取得
    const getMemo = async () => {
      try {
        const data = await fetchMemo();
        setCarryInMemo(data.carryInMemo);
        setWordList(data.wordList);
      } catch (error) {
        console.error("Failed to fetch memo", error);
      }
    };
    getMemo();
  }, []);

  const handleMemoClose = () => setMemoOpen(false);
  const handleAssistantClose = () => setAssistantOpen(false);

  const handleCloseTopicPopup = () => {
    setShowTopicPopup(false);
  };
  const handlePriorityHighClick = () => {
    setShowTopicPopup(true);
  };
  const handleSendMessage = async () => {
    if (inputMessage.trim() === "") return;

    setIsLoading(true); // ローディング状態を開始
    setMessages([...messages, `You: ${inputMessage}`]); // ユーザーのメッセージを表示
    const userMessage = inputMessage;
    setInputMessage(""); // 送信後に入力フィールドをクリア

    try {
      const assistantMessage = await askAssistant(userMessage);
      setMessages((prevMessages) => [
        ...prevMessages,
        `Assistant: ${assistantMessage}`,
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get response";
      setMessages((prevMessages) => [...prevMessages, `Error: ${message}`]);
    } finally {
      setIsLoading(false); // ローディング状態を終了
    }
  };

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<ReturnType<typeof startVoiceCall> | null>(null);
  const [callError, setCallError] = useState("");
  const [connection, setConnection] =
    useState<VoiceConnectionState>("connecting");
  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    setCallError("");
    const call = startVoiceCall({
      audio,
      conversationId: id,
      onConnection: setConnection,
      onState: (next) =>
        setConversation((current) =>
          !current || next.revision >= current.revision ? next : current,
        ),
      onError: (message) => {
        setCallError(message);
        volumeAnalyzerRef.current?.stop();
        opponentVolumeAnalyzerRef.current?.stop();
      },
      onLocal: (stream) => {
        volumeAnalyzerRef.current = new AudioVolumeAnalyzer(setisSpeak);
        volumeAnalyzerRef.current.start(stream);
      },
      onRemote: (stream) => {
        opponentVolumeAnalyzerRef.current = new AudioVolumeAnalyzer(
          setIsOpponentSpeak,
        );
        opponentVolumeAnalyzerRef.current.start(stream);
      },
    });
    callRef.current = call;
    call.mute(mutedRef.current);
    return () => {
      call.stop();
      volumeAnalyzerRef.current?.stop();
      opponentVolumeAnalyzerRef.current?.stop();
    };
  }, [id, retry]);
  const toggleMute = () => {
    const muted = !isMuted;
    mutedRef.current = muted;
    setIsMuted(muted);
    callRef.current?.mute(muted);
  };

  // visualize speaker
  const volumeAnalyzerRef = useRef<AudioVolumeAnalyzer | null>(null);
  const opponentVolumeAnalyzerRef = useRef<AudioVolumeAnalyzer | null>(null);
  const [isSpeak, setisSpeak] = useState(false);
  const [isOpponentSpeak, setIsOpponentSpeak] = useState(false);

  const [me, setMe] = useState<UserProfile | null>(null);
  useEffect(() => {
    let disposed = false;
    void fetchUserProfile()
      .then((value) => {
        if (!disposed) setMe(value);
      })
      .catch(() => {
        if (!disposed) setCallError("ユーザー情報を取得できませんでした");
      });
    return () => {
      disposed = true;
    };
  }, []);
  const partner =
    conversation && me ? conversationPartner(conversation, me.id) : null;
  const users = [
    {
      name: me?.username ?? "",
      icon: <Avatar src={me?.avatarUrl} name={me?.username ?? ""} large />,
    },
    {
      name: partner?.username ?? "",
      icon: (
        <Avatar
          src={partner?.avatar_url}
          name={partner?.username ?? ""}
          large
        />
      ),
    },
  ];
  const finish = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    setSaving(true);
    try {
      setConversation(await finishConversation(id));
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "終了を保存できませんでした。もう一度お試しください",
      );
    } finally {
      ending.current = false;
      setSaving(false);
    }
  }, [id]);
  useEffect(() => {
    if (clock?.phase === "completed")
      navigate(`/sessionrecord?conversation=${id}`, { replace: true });
    if (
      clock?.phase === "active" &&
      clock.has_deadline &&
      clock.remaining_seconds === 0 &&
      !automaticFinish.current
    ) {
      automaticFinish.current = true;
      void finish();
    }
  }, [
    clock?.phase,
    clock?.has_deadline,
    clock?.remaining_seconds,
    finish,
    id,
    navigate,
  ]);
  const cancel = async () => {
    setSaving(true);
    try {
      setConversation(await cancelConversation(id));
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "取り消せませんでした",
      );
    } finally {
      setSaving(false);
    }
  };

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
          {clock?.phase === "active"
            ? callError
              ? "通話は中断しています"
              : connection !== "connected"
                ? "再接続しています"
                : clock.has_deadline
                  ? `通話中：残り ${clock.remaining_seconds} 秒`
                  : "通話中"
            : clock?.phase === "cancelled"
              ? "通話はキャンセルされました"
              : "相手の接続を待っています"}
        </p>
        {clock?.can_finish && (
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={() => void finish()}
          >
            通話を終了して記録する
          </button>
        )}
        {clock?.phase === "planned" && (
          <button type="button" disabled={saving} onClick={() => void cancel()}>
            通話の予定を取り消す
          </button>
        )}
        {callError && clock?.can_join && (
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
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
            <p
              key={index}
              className="chat-bubble"
              data-own={message.startsWith("You:")}
            >
              {message}
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
