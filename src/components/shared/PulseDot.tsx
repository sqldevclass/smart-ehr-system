import { cn } from "@/lib/utils";

export function PulseDot({ className, title = "Новые заказы" }: { className?: string; title?: string }) {
  return <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)} title={title} role="img" aria-label={title}>
    <span className="absolute inset-0 rounded-full bg-destructive opacity-75 motion-safe:animate-ping" />
    <span className="relative h-2 w-2 rounded-full bg-destructive" />
  </span>;
}