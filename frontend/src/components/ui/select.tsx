import * as React from "react";
import { cn } from "@/lib/utils";

type Option = {
  value: string;
  label: string;
};

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Option[];
};

export function Select({ className, options, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
