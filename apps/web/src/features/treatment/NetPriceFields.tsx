import { useTranslation } from "react-i18next";
import { moneyCents, moneyString } from "@clinic/shared";
import { Field } from "../../components/ui";

export function NetPriceFields({ id, base, value, onChange, disabled }: {
  id: string; base: bigint; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const valid = /^\d+(?:\.\d{0,2})?$/.test(value) && moneyCents(value) <= base;
  const net = valid ? moneyCents(value) : base;
  const discount = base - net;
  const percent = base ? moneyString((discount * 10000n + base / 2n) / base) : "0.00";
  return <fieldset disabled={disabled} className="grid grid-cols-3 gap-2">
    <p className="col-span-3 text-xs">{t("discountBase")}: <strong>{moneyString(base)} USD</strong></p>
    <Field id={id + "-net-price"} label={t("twNetPrice")}>
      <input id={id + "-net-price"} className="input" type="number" min="0" max={moneyString(base)} step="0.01" required
        value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
    <Field id={id + "-discount-amount"} label={t("discountAmount")}>
      <input id={id + "-discount-amount"} className="input bg-soft" readOnly tabIndex={-1} value={valid ? moneyString(discount) : "—"} />
    </Field>
    <Field id={id + "-discount-percent"} label={t("discountPercent")}>
      <input id={id + "-discount-percent"} className="input bg-soft" readOnly tabIndex={-1} value={valid ? percent : "—"} />
    </Field>
    <p className="col-span-3 text-xs text-muted">{t("discountNetHint")}</p>
    {!valid && <p role="alert" className="col-span-3 text-xs text-danger-ink">{t("netPriceInvalid")}</p>}
  </fieldset>;
}
