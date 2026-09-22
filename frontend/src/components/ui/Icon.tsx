const paths = {
  home: "m3 10 9-7 9 7v11h-6v-7H9v7H3Z",
  book: "M12 5v16M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Z",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
  muted:
    "m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v5M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8",
  bell: "M5 10a7 7 0 0 1 14 0v5l2 3H3l2-3ZM9 21h6",
  settings:
    "m9 3 1-2h4l1 2 3 2 2 1 2 4-1 2v3l1 2-3 4-2-1-3 1-2 2-4-1v-2l-3-2-2-1-1-4 2-1V9L2 7l3-3 2 1ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
  close: "m6 6 12 12M6 18 18 6",
  back: "m10 5-7 7 7 7M3 12h18",
  person: "M16 6a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 22v-3a8 8 0 0 1 16 0v3",
  message: "M3 3h18v14H9l-6 4ZM7 7h10M7 12h7",
  search: "M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0m-2 5 6 6",
  topic: "M12 3v11M12 19v2",
  trophy:
    "M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a5 5 0 0 0 5 5M17 5h4v3a5 5 0 0 1-5 5M12 15v5M7 22h10",
  note: "M14 3H3v18h18V10M10 15l1-4L19 3l3 3-8 8ZM6 17h4",
  folder: "M3 5h7l2 3h9v13H3Z",
};

export function Icon({
  name,
  size = 24,
}: {
  name: keyof typeof paths;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
