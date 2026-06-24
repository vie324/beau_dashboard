import * as React from "react";
import { cn } from "@/helper/utils/cn";

// フォント: スマホは 16px(text-base) にする。iOS Safari は 16px 未満の入力に
// フォーカスするとページを自動ズームしてしまうため。PC(sm 以上)は従来の 14px。
const baseField =
  "w-full rounded-xl border border-line bg-base px-3 py-2 text-base sm:text-sm text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(baseField, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(baseField, "min-h-[80px] resize-y", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      baseField,
      // appearance-none でネイティブの矢印が消えるため、select-chevron で
      // 独自の▾アイコンを背景に描く（プルダウンだと一目で分かるように）。
      "h-10 appearance-none select-chevron pr-8",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted",
        className,
      )}
      {...props}
    />
  );
}
