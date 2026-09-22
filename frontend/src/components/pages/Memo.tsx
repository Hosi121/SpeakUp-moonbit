import { useMemo } from "react";
import { createMemo, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
import { MemoInputField } from "../utils/MemoInputField";

export function Memo() {
  const controller = useMemo(() => createMemo(browserPorts()), []);
  const { carryInMemo, wordList, busy, error, saved } =
    useController(controller);
  const save = controller.save;
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
              setValue={controller.set_memo}
            />
            <MemoInputField
              label="ワードリスト"
              value={wordList}
              setValue={controller.set_words}
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
