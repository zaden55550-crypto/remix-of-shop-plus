/* -------------------------------------------------------
   Currency Conversion & Exchange Rates against USD
------------------------------------------------------- */

export const USD_RATES: Record<string, { rate: number; symbol: string; prefix?: boolean }> = {
  USD: { rate: 1, symbol: "$", prefix: true },
  KSH: { rate: 130, symbol: "KSh", prefix: true },
  KES: { rate: 130, symbol: "KSh", prefix: true },
  SOM: { rate: 570, symbol: "Sh.So.", prefix: false },
  SOS: { rate: 570, symbol: "Sh.So.", prefix: false },
  USH: { rate: 3750, symbol: "USh", prefix: true },
  UGX: { rate: 3750, symbol: "USh", prefix: true },
  TSH: { rate: 2600, symbol: "TSh", prefix: true },
  TZS: { rate: 2600, symbol: "TSh", prefix: true },
  RWF: { rate: 1350, symbol: "FRw", prefix: true },
  ETB: { rate: 120, symbol: "Br", prefix: true },
  DJF: { rate: 178, symbol: "Fdj", prefix: false },
  SSP: { rate: 1300, symbol: "SSP", prefix: true },
  SDG: { rate: 600, symbol: "SDG", prefix: true },
  EUR: { rate: 0.92, symbol: "€", prefix: true },
  GBP: { rate: 0.79, symbol: "£", prefix: true },
  AED: { rate: 3.67, symbol: "AED", prefix: true },
  SAR: { rate: 3.75, symbol: "SAR", prefix: true },
  QAR: { rate: 3.64, symbol: "QAR", prefix: true },
  CAD: { rate: 1.38, symbol: "CA$", prefix: true },
  AUD: { rate: 1.52, symbol: "A$", prefix: true },
  INR: { rate: 84, symbol: "₹", prefix: true },
  CNY: { rate: 7.25, symbol: "¥", prefix: true },
  JPY: { rate: 155, symbol: "¥", prefix: true },
  ZAR: { rate: 18.2, symbol: "R", prefix: true },
  NGN: { rate: 1500, symbol: "₦", prefix: true },
  GHS: { rate: 15.5, symbol: "GH₵", prefix: true },
  ZMW: { rate: 27, symbol: "ZK", prefix: true },
  BWP: { rate: 13.5, symbol: "P", prefix: true },
  NAD: { rate: 18.2, symbol: "N$", prefix: true },
  MWK: { rate: 1730, symbol: "MK", prefix: true },
  MZN: { rate: 64, symbol: "MT", prefix: true },
  EGP: { rate: 48, symbol: "E£", prefix: true },
  MAD: { rate: 9.8, symbol: "MAD", prefix: true },
  TRY: { rate: 34, symbol: "₺", prefix: true },
  BRL: { rate: 5.4, symbol: "R$", prefix: true },
  MXN: { rate: 18.5, symbol: "Mex$", prefix: true },
  CHF: { rate: 0.89, symbol: "CHF", prefix: true },
  SGD: { rate: 1.35, symbol: "S$", prefix: true },
  MYR: { rate: 4.65, symbol: "RM", prefix: true },
  THB: { rate: 36, symbol: "฿", prefix: true },
  IDR: { rate: 16200, symbol: "Rp", prefix: true },
  PHP: { rate: 58, symbol: "₱", prefix: true },
  PKR: { rate: 278, symbol: "Rs", prefix: true },
  BDT: { rate: 118, symbol: "৳", prefix: true },
  LKR: { rate: 300, symbol: "Rs", prefix: true },
};

export function convertUsdToCurrency(
  usdAmount: number,
  currencyCode: string = "USD",
): {
  amount: number;
  formatted: string;
  symbol: string;
  currency: string;
} {
  const code = (currencyCode || "USD").toUpperCase();
  const info = USD_RATES[code] || { rate: 1, symbol: code, prefix: true };
  const raw = usdAmount * info.rate;
  const amount = info.rate >= 10 ? Math.round(raw) : Number(raw.toFixed(raw % 1 === 0 ? 0 : 2));
  const numStr = amount.toLocaleString("en-US");
  const formatted = info.prefix
    ? info.symbol === "$" || info.symbol === "€" || info.symbol === "£" || info.symbol === "¥"
      ? `${info.symbol}${numStr}`
      : `${info.symbol} ${numStr}`
    : `${numStr} ${info.symbol}`;
  return { amount, formatted, symbol: info.symbol, currency: code };
}
