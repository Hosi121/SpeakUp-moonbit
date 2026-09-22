import { useId } from "react";
import { Textarea } from "../ui/Field";

type MemoInputFieldProps = {
  value: string;
  setValue: (value: string) => void;
  label: string;
  maxLength?: number;
};

export function MemoInputField({
  value,
  setValue,
  label,
  maxLength = 500,
}: MemoInputFieldProps) {
  const countId = useId();
  return (
    <div className="stack compact">
      <Textarea
        label={label}
        rows={8}
        value={value}
        maxLength={maxLength}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby={countId}
      />
      <small id={countId} className="numeric">
        {value.length}/{maxLength}
      </small>
    </div>
  );
}
