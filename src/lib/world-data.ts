export interface WorldLanguage {
  code: string;
  name: string;
  native: string;
  dir?: "ltr" | "rtl";
}

export interface WorldCountryCurrency {
  countryCode: string;   // 3 characters e.g. KEN, USA, SOM, UAE
  countryName: string;
  currencyCode: string;  // 3 characters e.g. KSH, USD, SOM, AED
  currencyName: string;
  currencySymbol: string;
}

/* -------------------------------------------------------
   All World Languages (Self-contained, No API Required)
------------------------------------------------------- */

export const ALL_WORLD_LANGUAGES: WorldLanguage[] = [
  // Primary App Languages (with full ERP translation support)
  { code: "en", name: "English", native: "English" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "ar", name: "Arabic", native: "العربية", dir: "rtl" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "zh", name: "Chinese (Simplified)", native: "中文 (简体)" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },

  // African Languages
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "om", name: "Oromo", native: "Afaan Oromoo" },
  { code: "ti", name: "Tigrinya", native: "ትግርኛ" },
  { code: "ha", name: "Hausa", native: "Harshen Hausa" },
  { code: "yo", name: "Yoruba", native: "Èdè Yorùbá" },
  { code: "ig", name: "Igbo", native: "Asụsụ Igbo" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
  { code: "xh", name: "Xhosa", native: "isiXhosa" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "rw", name: "Kinyarwanda", native: "Ikinyarwanda" },
  { code: "rn", name: "Kirundi", native: "Ikirundi" },
  { code: "lg", name: "Luganda", native: "Oluganda" },
  { code: "sn", name: "Shona", native: "chiShona" },
  { code: "ny", name: "Chichewa", native: "Chichewa" },
  { code: "wo", name: "Wolof", native: "Wolof" },
  { code: "mg", name: "Malagasy", native: "Malagasy" },

  // Middle Eastern & Central Asian Languages
  { code: "fa", name: "Persian (Farsi)", native: "فارسی", dir: "rtl" },
  { code: "ur", name: "Urdu", native: "اردو", dir: "rtl" },
  { code: "he", name: "Hebrew", native: "עברית", dir: "rtl" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ku", name: "Kurdish", native: "Kurdî / کوردی", dir: "rtl" },
  { code: "ps", name: "Pashto", native: "پښتو", dir: "rtl" },
  { code: "az", name: "Azerbaijani", native: "Azərbaycan" },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha" },
  { code: "kk", name: "Kazakh", native: "Қазақ тілі" },
  { code: "tk", name: "Turkmen", native: "Türkmençe" },
  { code: "tg", name: "Tajik", native: "Тоҷикӣ" },
  { code: "ky", name: "Kyrgyz", native: "Кыргызча" },

  // South & Southeast Asian Languages
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "my", name: "Burmese", native: "မြန်မာစာ" },
  { code: "km", name: "Khmer", native: "ភាសាខ្មែរ" },
  { code: "lo", name: "Lao", native: "ພາສາລາວ" },
  { code: "tl", name: "Tagalog (Filipino)", native: "Tagalog" },

  // East Asian Languages
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "mn", name: "Mongolian", native: "Монгол хэл" },

  // European Languages
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "sr", name: "Serbian", native: "Српски" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "bs", name: "Bosnian", native: "Bosanski" },
  { code: "sk", name: "Slovak", native: "Slovenčina" },
  { code: "sl", name: "Slovenian", native: "Slovenščina" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių" },
  { code: "lv", name: "Latvian", native: "Latviešu" },
  { code: "et", name: "Estonian", native: "Eesti" },
  { code: "sq", name: "Albanian", native: "Shqip" },
  { code: "mk", name: "Macedonian", native: "Македонски" },
  { code: "hy", name: "Armenian", native: "Հայերեն" },
  { code: "ka", name: "Georgian", native: "ქართული" },
  { code: "ca", name: "Catalan", native: "Català" },
  { code: "eu", name: "Basque", native: "Euskara" },
  { code: "gl", name: "Galician", native: "Galego" },
  { code: "is", name: "Icelandic", native: "Íslenska" },
  { code: "ga", name: "Irish", native: "Gaeilge" },
  { code: "mt", name: "Maltese", native: "Malti" },
  { code: "lb", name: "Luxembourgish", native: "Lëtzebuergesch" },
];

export function searchLanguages(query: string): WorldLanguage[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_WORLD_LANGUAGES;
  return ALL_WORLD_LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.native.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
  );
}

/* -------------------------------------------------------
   Countries & Currencies Linked (3-Char Country & Currency)
------------------------------------------------------- */

export const WORLD_COUNTRIES_CURRENCIES: WorldCountryCurrency[] = [
  // Primary East & Central Africa
  { countryCode: "KEN", countryName: "Kenya", currencyCode: "KSH", currencyName: "Kenyan Shilling", currencySymbol: "KSh" },
  { countryCode: "SOM", countryName: "Somalia", currencyCode: "SOM", currencyName: "Somali Shilling", currencySymbol: "Sh.So." },
  { countryCode: "UGA", countryName: "Uganda", currencyCode: "USH", currencyName: "Ugandan Shilling", currencySymbol: "USh" },
  { countryCode: "TZA", countryName: "Tanzania", currencyCode: "TSH", currencyName: "Tanzanian Shilling", currencySymbol: "TSh" },
  { countryCode: "RWA", countryName: "Rwanda", currencyCode: "RWF", currencyName: "Rwandan Franc", currencySymbol: "FRw" },
  { countryCode: "ETH", countryName: "Ethiopia", currencyCode: "ETB", currencyName: "Ethiopian Birr", currencySymbol: "Br" },
  { countryCode: "DJI", countryName: "Djibouti", currencyCode: "DJF", currencyName: "Djiboutian Franc", currencySymbol: "Fdj" },
  { countryCode: "SSD", countryName: "South Sudan", currencyCode: "SSP", currencyName: "South Sudanese Pound", currencySymbol: "SS£" },
  { countryCode: "SDN", countryName: "Sudan", currencyCode: "SDG", currencyName: "Sudanese Pound", currencySymbol: "SDG" },
  { countryCode: "BDI", countryName: "Burundi", currencyCode: "BIF", currencyName: "Burundian Franc", currencySymbol: "FBu" },
  { countryCode: "COD", countryName: "DR Congo", currencyCode: "CDF", currencyName: "Congolese Franc", currencySymbol: "FC" },

  // Major Global Powers
  { countryCode: "USA", countryName: "United States", currencyCode: "USD", currencyName: "US Dollar", currencySymbol: "$" },
  { countryCode: "UAE", countryName: "United Arab Emirates", currencyCode: "AED", currencyName: "UAE Dirham", currencySymbol: "د.إ" },
  { countryCode: "SAU", countryName: "Saudi Arabia", currencyCode: "SAR", currencyName: "Saudi Riyal", currencySymbol: "﷼" },
  { countryCode: "GBR", countryName: "United Kingdom", currencyCode: "GBP", currencyName: "British Pound", currencySymbol: "£" },
  { countryCode: "EUR", countryName: "European Union", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "IND", countryName: "India", currencyCode: "INR", currencyName: "Indian Rupee", currencySymbol: "₹" },
  { countryCode: "CHN", countryName: "China", currencyCode: "CNY", currencyName: "Chinese Yuan", currencySymbol: "¥" },
  { countryCode: "JPN", countryName: "Japan", currencyCode: "JPY", currencyName: "Japanese Yen", currencySymbol: "¥" },
  { countryCode: "CAN", countryName: "Canada", currencyCode: "CAD", currencyName: "Canadian Dollar", currencySymbol: "CA$" },
  { countryCode: "AUS", countryName: "Australia", currencyCode: "AUD", currencyName: "Australian Dollar", currencySymbol: "A$" },
  { countryCode: "TUR", countryName: "Turkey", currencyCode: "TRY", currencyName: "Turkish Lira", currencySymbol: "₺" },
  { countryCode: "QAT", countryName: "Qatar", currencyCode: "QAR", currencyName: "Qatari Riyal", currencySymbol: "ر.ق" },
  { countryCode: "KWT", countryName: "Kuwait", currencyCode: "KWD", currencyName: "Kuwaiti Dinar", currencySymbol: "د.ك" },
  { countryCode: "OMN", countryName: "Oman", currencyCode: "OMR", currencyName: "Omani Rial", currencySymbol: "ر.ع." },
  { countryCode: "BHR", countryName: "Bahrain", currencyCode: "BHD", currencyName: "Bahraini Dinar", currencySymbol: ".د.ب" },

  // Rest of Africa
  { countryCode: "NGA", countryName: "Nigeria", currencyCode: "NGN", currencyName: "Nigerian Naira", currencySymbol: "₦" },
  { countryCode: "ZAF", countryName: "South Africa", currencyCode: "ZAR", currencyName: "South African Rand", currencySymbol: "R" },
  { countryCode: "EGY", countryName: "Egypt", currencyCode: "EGP", currencyName: "Egyptian Pound", currencySymbol: "E£" },
  { countryCode: "GHA", countryName: "Ghana", currencyCode: "GHS", currencyName: "Ghanaian Cedi", currencySymbol: "GH₵" },
  { countryCode: "MAR", countryName: "Morocco", currencyCode: "MAD", currencyName: "Moroccan Dirham", currencySymbol: "د.م." },
  { countryCode: "DZA", countryName: "Algeria", currencyCode: "DZD", currencyName: "Algerian Dinar", currencySymbol: "د.ج" },
  { countryCode: "TUN", countryName: "Tunisia", currencyCode: "TND", currencyName: "Tunisian Dinar", currencySymbol: "د.ت" },
  { countryCode: "ZMB", countryName: "Zambia", currencyCode: "ZMW", currencyName: "Zambian Kwacha", currencySymbol: "ZK" },
  { countryCode: "ZWE", countryName: "Zimbabwe", currencyCode: "ZWL", currencyName: "Zimbabwean Dollar", currencySymbol: "Z$" },
  { countryCode: "MOZ", countryName: "Mozambique", currencyCode: "MZN", currencyName: "Mozambican Metical", currencySymbol: "MT" },
  { countryCode: "BWA", countryName: "Botswana", currencyCode: "BWP", currencyName: "Botswana Pula", currencySymbol: "P" },
  { countryCode: "NAM", countryName: "Namibia", currencyCode: "NAD", currencyName: "Namibian Dollar", currencySymbol: "N$" },
  { countryCode: "MWI", countryName: "Malawi", currencyCode: "MWK", currencyName: "Malawian Kwacha", currencySymbol: "MK" },
  { countryCode: "AGO", countryName: "Angola", currencyCode: "AOA", currencyName: "Angolan Kwanza", currencySymbol: "Kz" },
  { countryCode: "SEN", countryName: "Senegal", currencyCode: "XOF", currencyName: "West African CFA Franc", currencySymbol: "CFA" },
  { countryCode: "CIV", countryName: "Ivory Coast", currencyCode: "XOF", currencyName: "West African CFA Franc", currencySymbol: "CFA" },
  { countryCode: "CMR", countryName: "Cameroon", currencyCode: "XAF", currencyName: "Central African CFA Franc", currencySymbol: "FCFA" },

  // Asia & Americas
  { countryCode: "BRA", countryName: "Brazil", currencyCode: "BRL", currencyName: "Brazilian Real", currencySymbol: "R$" },
  { countryCode: "MEX", countryName: "Mexico", currencyCode: "MXN", currencyName: "Mexican Peso", currencySymbol: "$" },
  { countryCode: "ARG", countryName: "Argentina", currencyCode: "ARS", currencyName: "Argentine Peso", currencySymbol: "$" },
  { countryCode: "IDN", countryName: "Indonesia", currencyCode: "IDR", currencyName: "Indonesian Rupiah", currencySymbol: "Rp" },
  { countryCode: "MYS", countryName: "Malaysia", currencyCode: "MYR", currencyName: "Malaysian Ringgit", currencySymbol: "RM" },
  { countryCode: "SGP", countryName: "Singapore", currencyCode: "SGD", currencyName: "Singapore Dollar", currencySymbol: "S$" },
  { countryCode: "THA", countryName: "Thailand", currencyCode: "THB", currencyName: "Thai Baht", currencySymbol: "฿" },
  { countryCode: "VNM", countryName: "Vietnam", currencyCode: "VND", currencyName: "Vietnamese Dong", currencySymbol: "₫" },
  { countryCode: "PHL", countryName: "Philippines", currencyCode: "PHP", currencyName: "Philippine Peso", currencySymbol: "₱" },
  { countryCode: "PAK", countryName: "Pakistan", currencyCode: "PKR", currencyName: "Pakistani Rupee", currencySymbol: "₨" },
  { countryCode: "BGD", countryName: "Bangladesh", currencyCode: "BDT", currencyName: "Bangladeshi Taka", currencySymbol: "৳" },
  { countryCode: "LKA", countryName: "Sri Lanka", currencyCode: "LKR", currencyName: "Sri Lankan Rupee", currencySymbol: "Rs" },
  { countryCode: "KOR", countryName: "South Korea", currencyCode: "KRW", currencyName: "South Korean Won", currencySymbol: "₩" },
  { countryCode: "CHE", countryName: "Switzerland", currencyCode: "CHF", currencyName: "Swiss Franc", currencySymbol: "CHF" },
  { countryCode: "NOR", countryName: "Norway", currencyCode: "NOK", currencyName: "Norwegian Krone", currencySymbol: "kr" },
  { countryCode: "SWE", countryName: "Sweden", currencyCode: "SEK", currencyName: "Swedish Krona", currencySymbol: "kr" },
  { countryCode: "DNK", countryName: "Denmark", currencyCode: "DKK", currencyName: "Danish Krone", currencySymbol: "kr" },
  { countryCode: "POL", countryName: "Poland", currencyCode: "PLN", currencyName: "Polish Zloty", currencySymbol: "zł" },
  { countryCode: "RUS", countryName: "Russia", currencyCode: "RUB", currencyName: "Russian Ruble", currencySymbol: "₽" },
  { countryCode: "NZL", countryName: "New Zealand", currencyCode: "NZD", currencyName: "New Zealand Dollar", currencySymbol: "NZ$" },
  { countryCode: "YEM", countryName: "Yemen", currencyCode: "YER", currencyName: "Yemeni Rial", currencySymbol: "﷼" },
  { countryCode: "JOR", countryName: "Jordan", currencyCode: "JOD", currencyName: "Jordanian Dinar", currencySymbol: "د.ا" },
  { countryCode: "LBN", countryName: "Lebanon", currencyCode: "LBP", currencyName: "Lebanese Pound", currencySymbol: "ل.ل" },
  { countryCode: "IRQ", countryName: "Iraq", currencyCode: "IQD", currencyName: "Iraqi Dinar", currencySymbol: "ع.د" },
];

export function findByCurrency(currencyCode: string): WorldCountryCurrency | undefined {
  const norm = currencyCode.trim().toUpperCase();
  return WORLD_COUNTRIES_CURRENCIES.find((c) => c.currencyCode.toUpperCase() === norm);
}

export function findByCountry(countryCode: string): WorldCountryCurrency | undefined {
  const norm = countryCode.trim().toUpperCase();
  return WORLD_COUNTRIES_CURRENCIES.find((c) => c.countryCode.toUpperCase() === norm);
}

export function searchCurrencies(query: string): WorldCountryCurrency[] {
  const q = query.trim().toLowerCase();
  if (!q) return WORLD_COUNTRIES_CURRENCIES;
  return WORLD_COUNTRIES_CURRENCIES.filter(
    (c) =>
      c.currencyCode.toLowerCase().includes(q) ||
      c.currencyName.toLowerCase().includes(q) ||
      c.currencySymbol.toLowerCase().includes(q) ||
      c.countryName.toLowerCase().includes(q) ||
      c.countryCode.toLowerCase().includes(q)
  );
}

export function searchCountries(query: string): WorldCountryCurrency[] {
  const q = query.trim().toLowerCase();
  if (!q) return WORLD_COUNTRIES_CURRENCIES;
  return WORLD_COUNTRIES_CURRENCIES.filter(
    (c) =>
      c.countryCode.toLowerCase().includes(q) ||
      c.countryName.toLowerCase().includes(q) ||
      c.currencyCode.toLowerCase().includes(q) ||
      c.currencyName.toLowerCase().includes(q)
  );
}
