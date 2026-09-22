import { useEffect, type AnchorHTMLAttributes } from "react";
import { navigate } from "./location";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
};

export function Link({ to, onClick, ...props }: LinkProps) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        const anchor = event.currentTarget;
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          anchor.hasAttribute("download") ||
          (anchor.target && anchor.target !== "_self")
        )
          return;
        const url = new URL(anchor.href);
        if (
          url.origin !== location.origin ||
          (url.hash &&
            url.pathname === location.pathname &&
            url.search === location.search)
        )
          return;
        event.preventDefault();
        navigate(url.href);
      }}
    />
  );
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}
