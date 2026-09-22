import type { ReactNode } from "react";
import { Dialog } from "../ui/Dialog";

export function HalfModal({
  open,
  handleClose,
  children,
  title,
}: {
  open: boolean;
  handleClose: () => void;
  children: ReactNode;
  title: string;
}) {
  return (
    <Dialog open={open} onClose={handleClose} title={title} sheet>
      {children}
    </Dialog>
  );
}
