import { startVoiceCall } from "../../services/voiceCall";
import { HalfModal } from "../utils/HalfModal";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Typography,
  Box,
  List,
  ListItem,
  Paper,
  ListItemText,
  TextField,
  Button,
  Tab,
  Avatar,
} from "@mui/material";
import HomeLogo from "../../assets/homeLogo";
import { Person } from "@mui/icons-material";
import { SessionBottomNavigationTemplate } from "../templates/SessionBottomNavigationTemplate";
import SessionContainer from "../utils/SessionContainer";
import { fetchMemo } from "../../services/memoService"; // Import the fetchMemo function
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { useNavigate } from "react-router-dom";
import { TopicPopup } from "../utils/TopicPopup";
import { AudioVolumeAnalyzer } from "../utils/AudioVolumeAnalyzer";
import { fetchUserProfile } from "../../services/userService";
import { askAssistant } from "../../services/chatService";
import { SessionStepContext } from "../utils/SessionStepContextProvider";

const theme = "好きな言葉";



type UserCardData = {
  name: string;
  icon: JSX.Element;
};

export const Session = () => {
  const sessionTime = 300; // [s]
  const [memoOpen, setMemoOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false); // ローディング状態を管理
  const [carryInMemo, setCarryInMemo] = useState("");
  const [wordList, setWordList] = useState("");
  const [value, setValue] = useState("1");
  const [isMuted, setIsMuted] = useState(false);
  const [countdown, setCountdown] = useState(sessionTime + 3);
  const navigate = useNavigate();
  const { sessionStep, setSessionStep } = useContext(SessionStepContext);

  const [showTopicPopup, setShowTopicPopup] = useState(false);
  const [isPriorityHighClicked, setIsPriorityHighClicked] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isPriorityHighClicked) {
        setShowTopicPopup(true);
      }
    }, 8000); // 2 minutes and 3 seconds
    return () => clearTimeout(timer);
  }, [isPriorityHighClicked]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      navigate("/sessioninterval");
      const nextStep = sessionStep + 1;
      setSessionStep(nextStep);
      if (nextStep >= 3) {
        navigate("/sessionrecord");
      }
    }
  }, [countdown, navigate]);
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

  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };
  const handleCloseTopicPopup = () => {
    setShowTopicPopup(false);
  };
  const handlePriorityHighClick = () => {
    setShowTopicPopup(true);
    setIsPriorityHighClicked(true);
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
      setMessages((prevMessages) => [
        ...prevMessages,
        `Error: ${message}`,
      ]);
    } finally {
      setIsLoading(false); // ローディング状態を終了
    }
  };

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<ReturnType<typeof startVoiceCall> | null>(null);
  const [callError, setCallError] = useState("");
  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    const call = startVoiceCall({
      audio, round: sessionStep + 1, onError: message => {
        setCallError(message);
        volumeAnalyzerRef.current?.stop();
        opponentVolumeAnalyzerRef.current?.stop();
      },
      onLocal: stream => {
        volumeAnalyzerRef.current = new AudioVolumeAnalyzer(setisSpeak);
        volumeAnalyzerRef.current.start(stream);
      },
      onRemote: stream => {
        opponentVolumeAnalyzerRef.current = new AudioVolumeAnalyzer(setIsOpponentSpeak);
        opponentVolumeAnalyzerRef.current.start(stream);
      },
    });
    callRef.current = call;
    return () => {
      call.stop();
      volumeAnalyzerRef.current?.stop();
      opponentVolumeAnalyzerRef.current?.stop();
    };
  }, [sessionStep]);
  const toggleMute = () => {
    const muted = !isMuted;
    setIsMuted(muted);
    callRef.current?.mute(muted);
  };

  // visualize speaker
  const volumeAnalyzerRef = useRef<AudioVolumeAnalyzer | null>(null);
  const opponentVolumeAnalyzerRef = useRef<AudioVolumeAnalyzer | null>(null);
  const [isSpeak, setisSpeak] = useState(false);
  const [isOpponentSpeak, setIsOpponentSpeak] = useState(false);

  // userInfo
  const initialUserCardInfo = { name: "", icon: <Person /> };
  const [userCardInfo, setUserCardInfo] =
    useState<UserCardData>(initialUserCardInfo);
  const [opponentUserCardInfo, setOpponentUserCardInfo] =
    useState<UserCardData>(initialUserCardInfo);

  const getFullAvatarUrl = (avatarUrl: string) => {
    if (!avatarUrl) return ""; // デフォルトのアバター画像のURLを設定することもできます
    if (avatarUrl.startsWith("http")) return avatarUrl; // すでに完全なURLの場合
    return `http://localhost:8081${avatarUrl}`; // ローカル開発環境の場合
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userInfoResponse = await fetchUserProfile();
        const opponentUserCardDataResponse = await fetchUserProfile();
        const userInfo: UserCardData = {
          name: userInfoResponse.username,
          icon: (
            <Avatar
              src={getFullAvatarUrl(userInfoResponse.avatarUrl)}
              sx={{ width: 80, height: 80 }}
            />
          ),
        };
        const opponentUserInfo: UserCardData = {
          name: opponentUserCardDataResponse.username,
          icon: <Person />,
        };
        setUserCardInfo(userInfo);
        setOpponentUserCardInfo(opponentUserInfo);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
  }, []);

  return (
    <SessionBottomNavigationTemplate
      value="other"
      isMute={isMuted}
      toggleMute={toggleMute}
      setMemoOpen={setMemoOpen}
      setAssistantOpen={setAssistantOpen}
      onPriorityHighClick={handlePriorityHighClick}
    >
      <SessionContainer
        theme={theme}
        users={[userCardInfo, opponentUserCardInfo]}
        isSpeak={isSpeak && !isMuted}
        isOpponentSpeak={isOpponentSpeak}
      />
      <TopicPopup isVisible={showTopicPopup} onClose={handleCloseTopicPopup} />
      <HalfModal open={memoOpen} handleClose={handleMemoClose} title="">
        <TabContext value={value}>
          <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
            <TabList
              onChange={handleChange}
              sx={{ display: "grid", placeContent: "center" }}
            >
              <Tab label=" 持ち込みメモ" value="1" />
              <Tab label="ワードリスト" value="2" />
            </TabList>
          </Box>
          <TabPanel value="1">
            <Typography variant="body1">{carryInMemo}</Typography>
          </TabPanel>
          <TabPanel value="2">
            <Typography variant="body1">{wordList}</Typography>
          </TabPanel>
        </TabContext>
      </HalfModal>
      <HalfModal
        open={assistantOpen}
        handleClose={handleAssistantClose}
        title="アシスタント"
      >
        <Box sx={{ overflow: "auto", pt: 1, pb: 1, maxHeight: "30vh" }}>
          <List>
            {/* アシスタントからの初期メッセージ */}
            <ListItem sx={{ justifyContent: "flex-start" }}>
              <Box
                sx={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "secondary.main",
                  mr: 2,
                  display: "grid",
                  placeContent: "center",
                }}
              >
                <HomeLogo style={{ width: "70%", height: "fit-content" }} />
              </Box>
              <Paper
                sx={{
                  padding: "5px",
                  backgroundColor: "background.default",
                  maxWidth: "60%",
                  wordWrap: "break-word",
                }}
              >
                <ListItemText primary="何かお困りですか？" />
              </Paper>
            </ListItem>

            {/* メッセージのリスト */}
            {messages.map((message, index) => (
              <ListItem
                key={index}
                sx={{
                  justifyContent: message.startsWith("You:")
                    ? "flex-end"
                    : "flex-start",
                }}
              >
                <Paper
                  sx={{
                    padding: "5px",
                    backgroundColor: message.startsWith("You:")
                      ? "#f0f0f0"
                      : "background.default",
                    maxWidth: "60%",
                    wordWrap: "break-word",
                  }}
                >
                  <ListItemText primary={message} />
                </Paper>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* メッセージ入力欄と送信ボタン */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            pb: 2,
            position: "fixed",
            bottom: 0,
            backgroundColor: "secondary.main",
          }}
        >
          <TextField
            variant="outlined"
            placeholder="メッセージを入力"
            fullWidth
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            sx={{ mr: 2 }}
            InputProps={{
              style: {
                height: "40px",
              },
            }}
            disabled={isLoading} // ローディング中は入力を無効化
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleSendMessage}
            disabled={isLoading}
          >
            {isLoading ? "送信中..." : "送信"}
          </Button>
        </Box>
      </HalfModal>
      <audio ref={remoteAudioRef} autoPlay controls aria-label="相手の音声" />
      {callError && <Typography role="alert">{callError}</Typography>}
    </SessionBottomNavigationTemplate>
  );
};

export default Session;
