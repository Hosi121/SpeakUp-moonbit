import trophyData from "../../assets/trophy.json";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { Icon } from "../ui/Icon";

export function Stats() {
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        <h1>参加データ</h1>
        <div className="panel grid center numeric">
          <div>
            <h2 className="accent">5回</h2>
            <p>回数</p>
          </div>
          <div>
            <h2 className="accent">20</h2>
            <p>セッション数</p>
          </div>
        </div>
        <h2>与えられたトロフィー</h2>
        <ul className="plain-list stack">
          {trophyData.trophies.map((trophy, index) => (
            <li className="row" key={index}>
              <Icon name="trophy" />
              <span>{trophy.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </BottomNavigationTemplate>
  );
}
