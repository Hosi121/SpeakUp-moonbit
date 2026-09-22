import { useState, useEffect } from "react";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
import { MemoInputField } from "../utils/MemoInputField";
import { fetchMemo, saveMemo } from "../../services/memoService";

export function Memo() {
  const [carryInMemo, setCarryInMemo] = useState("");
  const [wordList, setWordList] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void fetchMemo()
      .then((data) => {
        setCarryInMemo(data.carryInMemo);
        setWordList(data.wordList);
      })
      .catch(() => setError("メモを取得できませんでした。"))
      .finally(() => setBusy(false));
  }, []);
  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await saveMemo({ carryInMemo, wordList });
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        <h1>持ち込みメモ</h1>
        <form
          className="panel stack"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="stack" disabled={busy}>
            <MemoInputField
              label="持ち込みメモ"
              value={carryInMemo}
              setValue={(value) => {
                setCarryInMemo(value);
                setSaved(false);
              }}
            />
            <MemoInputField
              label="ワードリスト"
              value={wordList}
              setValue={(value) => {
                setWordList(value);
                setSaved(false);
              }}
            />
            <button type="submit" className="primary">
              保存
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">保存しました。</p>}
        </form>
      </div>
    </BottomNavigationTemplate>
  );
}
