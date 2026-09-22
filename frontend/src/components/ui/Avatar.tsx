import { Icon } from "./Icon";

export function Avatar({
  src,
  name,
  large = false,
}: {
  src?: string;
  name: string;
  large?: boolean;
}) {
  return (
    <span className={large ? "avatar avatar-large" : "avatar"}>
      {src ? (
        <img src={src} alt={name} />
      ) : (
        <Icon name="person" size={large ? 48 : 24} />
      )}
    </span>
  );
}
