import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog";

interface LargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Screen-reader title (visually hidden); each caller renders its own header.
  title: string;
  children: ReactNode;
}

// The single large pop-up shell used app-wide (Лист назначения, document viewer).
// Radix gives Esc-to-close, focus trap and scroll lock.
export default function LargeModal({ open, onOpenChange, title, children }: LargeModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-[hsl(var(--modal-overlay)/0.4)]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-xl bg-card shadow-[var(--modal-shadow)] w-[calc(100vw-80px)] h-[calc(100vh-40px)] focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
