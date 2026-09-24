import { useTranslation } from "react-i18next";
import { discountSchema, discountCents, moneyString, moneyCents, noDiscount, type Discount } from "@clinic/shared";
import { Field } from "../../components/ui";

export function DiscountFields({ id, base, discount, onChange, disabled }: {
  id: string; base: bigint; discount: Discount; onChange: (value: Discount) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const parsed = discountSchema.safeParse(discount);
  const amount = discountCents(base, parsed.success ? parsed.data : noDiscount);
  const percent = base ? moneyString((amount * 10000n + base / 2n) / base) : "0.00";
  const exceedsBase = parsed.success && parsed.data.type === "amount" && moneyCents(parsed.data.value) > base;
  return <fieldset disabled={disabled} className="grid grid-cols-2 gap-2">
    <p className="col-span-2 text-xs">{t("discountBase")}: <strong>{moneyString(base)} USD</strong></p>
    <Field id={id + "-discount-amount"} label={t("discountAmount")}>
      <input id={id + "-discount-amount"} className="input" type="number" min="0" max={moneyString(base)} step="0.01" required
        value={discount.type === "amount" ? discount.value : moneyString(amount)}
        onChange={(e) => onChange({ type: "amount", value: e.target.value })} />
    </Field>
    <Field id={id + "-discount-percent"} label={t("discountPercent")}>
      <input id={id + "-discount-percent"} className="input" type="number" min="0" max="100" step="0.01" required
        value={discount.type === "percent" ? discount.value : percent}
        onChange={(e) => onChange({ type: "percent", value: e.target.value })} />
    </Field>
    <p className="col-span-2 text-xs text-muted">{t("discountHint")}</p>
    <p className="col-span-2 text-xs font-semibold">{t("twNetPrice")}: {moneyString(base - amount)} USD</p>
    {(!parsed.success || exceedsBase) && <p role="alert" className="col-span-2 text-xs text-danger-ink">{t("discountInvalid")}</p>}
  </fieldset>;
}
