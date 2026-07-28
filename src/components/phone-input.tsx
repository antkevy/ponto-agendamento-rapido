import { forwardRef } from "react";
import { formatPhoneBR, onlyDigits } from "@/lib/phone";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
  /** Digits-only value (what you store). */
  value: string;
  /** Called with the digits-only value. */
  onChange: (digits: string) => void;
};

/**
 * Masked Brazilian phone input. Renders the formatted value, but exposes the
 * digits-only string via onChange, so callers store the canonical form.
 */
export const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput(
  { value, onChange, className, placeholder, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={placeholder ?? "(11) 91234-5678"}
      value={formatPhoneBR(value)}
      onChange={(e) => onChange(onlyDigits(e.target.value).slice(0, 11))}
      className={className}
      maxLength={16}
      {...rest}
    />
  );
});
