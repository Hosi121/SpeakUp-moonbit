import styles from "./TopWaves.module.css";

export default function TopWaves({ isFlipped }: { isFlipped: boolean }) {
  return (
    <svg
      className={isFlipped ? styles.flipped : styles.waves}
      viewBox="0 0 150 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 15Q38 0 75 15T150 15V28H0Z" fill="white" />
    </svg>
  );
}
