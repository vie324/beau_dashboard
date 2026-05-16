import * as React from "react";
import { cn } from "@/helper/utils/cn";

export function Badge({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5",
        className,
      )}
    >
      {children}
    </span>
  );
}
