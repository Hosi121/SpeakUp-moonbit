import type { ReactNode } from "react";
import { Link } from "../../navigation/links";

export function IconButton({
  icon,
  text,
  url,
}: {
  icon: ReactNode;
  text: string;
  url: string;
}) {
  return (
    <Link to={"/" + url} className="button panel tile">
      {icon}
      <span>{text}</span>
    </Link>
  );
}
