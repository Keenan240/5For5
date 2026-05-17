type FiveForFiveProps = {
  values: number[];
  className?: string;
};

export function FiveForFive({ values, className = "" }: FiveForFiveProps) {
  return (
    <p
      className={`py-2 font-mono text-xs leading-relaxed tracking-wide text-[var(--text-subtle)] ${className}`}
    >
      {values.join(" · ")}
    </p>
  );
}
