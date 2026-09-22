import { useState } from "react";
import TopSection from "../utils/TopSection";
import { MicCheckScreen } from "../utils/MicCheckScreen";
import { MicCheckFinished } from "../utils/MicCheckFinished";

export function MicCheck() {
  const [checked, setChecked] = useState(false);
  return (
    <main className="page stack">
      <TopSection />
      {checked ? (
        <MicCheckFinished />
      ) : (
        <MicCheckScreen isMicChecked={() => setChecked(true)} />
      )}
    </main>
  );
}
