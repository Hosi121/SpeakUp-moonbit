import { createMicrophone } from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import { mediaPorts } from "../../services/media";
import { realtimePorts } from "../../services/realtime";
import { page } from "../layout";
import { icon } from "../icons";
import homeLogo from "../../assets/homeLogo.svg";
import {
  element as el,
  button,
  link,
  alert,
  message,
  visible,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context),
    controller = createMicrophone(
      mediaPorts(() => null),
      realtimePorts(),
    );
  const error = alert(),
    meter = el("div", "audio-visualizer");
  meter.role = "img";
  meter.ariaLabel = "マイクの音量";
  const bars = Array.from({ length: 10 }, () => el("span", "audio-bar"));
  meter.append(...bars);
  const finish = button("準備OK!", controller.finish, "primary");
  const mark = () => {
    const logo = el("img");
    logo.src = homeLogo;
    logo.alt = "";
    return el("div", "brand-mark stack compact", logo, icon("mic", 36));
  };
  const pending = el(
    "div",
    "stack center",
    el("h1", "", "セッション前にマイクチェックをするよ！"),
    el("p", "", '"I\'ll enjoy speaking English!!" と言おう！'),
    error,
    meter,
    mark(),
    finish,
  );
  const done = el(
    "div",
    "stack center",
    el("h1", "", "マイクチェック完了！"),
    el("p", "", "準備はいいかな？"),
    link("準備OK!", "/sessionlist", "button primary"),
    mark(),
  );
  view.body.append(pending, done);
  view.scope.bind(controller, (s) => {
    visible(pending, !s.checked);
    visible(done, s.checked);
    message(error, s.error);
    visible(meter, !s.error);
    finish.disabled = !s.ready;
    for (let i = 0; i < bars.length; i++)
      bars[i].style.transform = `scaleY(${s.levels[i]})`;
  });
  return view.dispose;
}
