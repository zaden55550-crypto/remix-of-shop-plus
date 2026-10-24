export interface WorldLanguage {
  code: string;
  name: string;
  native: string;
  dir?: "ltr" | "rtl";
}

export interface WorldCountryCurrency {
  countryCode: string; // 3 characters e.g. KEN, USA, SOM, UAE
  countryName: string;
  currencyCode: string; // 3 characters e.g. KSH, USD, SOM, AED
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
  { code: "tg", name: "Tajik", native: "Тоҷикӣ" },
  { code: "tk", name: "Turkmen", native: "Türkmençe" },
  { code: "ky", name: "Kyrgyz", native: "Кыргызча" },

  // South Asian Languages
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "my", name: "Burmese", native: "မြန်မာစာ" },

  // East & Southeast Asian Languages
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "tl", name: "Tagalog (Filipino)", native: "Tagalog" },
  { code: "km", name: "Khmer", native: "ភាសាខ្មែរ" },
  { code: "lo", name: "Lao", native: "ພາສາລາວ" },

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
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "bg", name: "Bulgarian", native: "Български" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "sr", name: "Serbian", native: "Српски" },
  { code: "sk", name: "Slovak", native: "Slovenčina" },
  { code: "sl", name: "Slovenian", native: "Slovenščina" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių" },
  { code: "lv", name: "Latvian", native: "Latviešu" },
  { code: "et", name: "Estonian", native: "Eesti" },
  { code: "sq", name: "Albanian", native: "Shqip" },
  { code: "bs", name: "Bosnian", native: "Bosanski" },
  { code: "mk", name: "Macedonian", native: "Македонски" },
  { code: "hy", name: "Armenian", native: "Հայերեն" },
  { code: "ka", name: "Georgian", native: "ქართული" },
  { code: "eu", name: "Basque", native: "Euskara" },
  { code: "ca", name: "Catalan", native: "Català" },
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
    (l) => l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
  );
}

/* -------------------------------------------------------
   All World Countries & Currencies (Linked 3-Char Codes)
------------------------------------------------------- */

export const WORLD_COUNTRIES_CURRENCIES: WorldCountryCurrency[] = [
  // East & Horn of Africa
  {
    countryCode: "KEN",
    countryName: "Kenya",
    currencyCode: "KSH",
    currencyName: "Kenyan Shilling",
    currencySymbol: "KSh",
  },
  {
    countryCode: "SOM",
    countryName: "Somalia",
    currencyCode: "SOM",
    currencyName: "Somali Shilling",
    currencySymbol: "Sh.So.",
  },
  {
    countryCode: "UGA",
    countryName: "Uganda",
    currencyCode: "USH",
    currencyName: "Ugandan Shilling",
    currencySymbol: "USh",
  },
  {
    countryCode: "TZA",
    countryName: "Tanzania",
    currencyCode: "TSH",
    currencyName: "Tanzanian Shilling",
    currencySymbol: "TSh",
  },
  {
    countryCode: "RWA",
    countryName: "Rwanda",
    currencyCode: "RWF",
    currencyName: "Rwandan Franc",
    currencySymbol: "FRw",
  },
  {
    countryCode: "ETH",
    countryName: "Ethiopia",
    currencyCode: "ETB",
    currencyName: "Ethiopian Birr",
    currencySymbol: "Br",
  },
  {
    countryCode: "DJI",
    countryName: "Djibouti",
    currencyCode: "DJF",
    currencyName: "Djiboutian Franc",
    currencySymbol: "Fdj",
  },
  {
    countryCode: "SSD",
    countryName: "South Sudan",
    currencyCode: "SSP",
    currencyName: "South Sudanese Pound",
    currencySymbol: "SS£",
  },
  {
    countryCode: "SDN",
    countryName: "Sudan",
    currencyCode: "SDG",
    currencyName: "Sudanese Pound",
    currencySymbol: "SDG",
  },
  {
    countryCode: "ERI",
    countryName: "Eritrea",
    currencyCode: "ERN",
    currencyName: "Eritrean Nakfa",
    currencySymbol: "Nfk",
  },
  {
    countryCode: "BDI",
    countryName: "Burundi",
    currencyCode: "BIF",
    currencyName: "Burundian Franc",
    currencySymbol: "FBu",
  },
  {
    countryCode: "COD",
    countryName: "DR Congo",
    currencyCode: "CDF",
    currencyName: "Congolese Franc",
    currencySymbol: "FC",
  },
  {
    countryCode: "COG",
    countryName: "Republic of Congo",
    currencyCode: "XAF",
    currencyName: "Central African CFA",
    currencySymbol: "FCFA",
  },

  // Southern Africa
  {
    countryCode: "ZAF",
    countryName: "South Africa",
    currencyCode: "ZAR",
    currencyName: "South African Rand",
    currencySymbol: "R",
  },
  {
    countryCode: "ZMB",
    countryName: "Zambia",
    currencyCode: "ZMW",
    currencyName: "Zambian Kwacha",
    currencySymbol: "ZK",
  },
  {
    countryCode: "ZWE",
    countryName: "Zimbabwe",
    currencyCode: "ZWL",
    currencyName: "Zimbabwean Dollar",
    currencySymbol: "Z$",
  },
  {
    countryCode: "MOZ",
    countryName: "Mozambique",
    currencyCode: "MZN",
    currencyName: "Mozambican Metical",
    currencySymbol: "MT",
  },
  {
    countryCode: "BWA",
    countryName: "Botswana",
    currencyCode: "BWP",
    currencyName: "Botswana Pula",
    currencySymbol: "P",
  },
  {
    countryCode: "NAM",
    countryName: "Namibia",
    currencyCode: "NAD",
    currencyName: "Namibian Dollar",
    currencySymbol: "N$",
  },
  {
    countryCode: "MWI",
    countryName: "Malawi",
    currencyCode: "MWK",
    currencyName: "Malawian Kwacha",
    currencySymbol: "MK",
  },
  {
    countryCode: "AGO",
    countryName: "Angola",
    currencyCode: "AOA",
    currencyName: "Angolan Kwanza",
    currencySymbol: "Kz",
  },
  {
    countryCode: "MDG",
    countryName: "Madagascar",
    currencyCode: "MGA",
    currencyName: "Malagasy Ariary",
    currencySymbol: "Ar",
  },
  {
    countryCode: "MUS",
    countryName: "Mauritius",
    currencyCode: "MUR",
    currencyName: "Mauritian Rupee",
    currencySymbol: "Rs",
  },
  {
    countryCode: "SYC",
    countryName: "Seychelles",
    currencyCode: "SCR",
    currencyName: "Seychellois Rupee",
    currencySymbol: "SR",
  },
  {
    countryCode: "COM",
    countryName: "Comoros",
    currencyCode: "KMF",
    currencyName: "Comorian Franc",
    currencySymbol: "CF",
  },
  {
    countryCode: "SWZ",
    countryName: "Eswatini",
    currencyCode: "SZL",
    currencyName: "Swazi Lilangeni",
    currencySymbol: "E",
  },
  {
    countryCode: "LSO",
    countryName: "Lesotho",
    currencyCode: "LSL",
    currencyName: "Lesotho Loti",
    currencySymbol: "L",
  },

  // West & Central Africa
  {
    countryCode: "NGA",
    countryName: "Nigeria",
    currencyCode: "NGN",
    currencyName: "Nigerian Naira",
    currencySymbol: "₦",
  },
  {
    countryCode: "GHA",
    countryName: "Ghana",
    currencyCode: "GHS",
    currencyName: "Ghanaian Cedi",
    currencySymbol: "GH₵",
  },
  {
    countryCode: "SEN",
    countryName: "Senegal",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "CIV",
    countryName: "Ivory Coast",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "CMR",
    countryName: "Cameroon",
    currencyCode: "XAF",
    currencyName: "Central African CFA",
    currencySymbol: "FCFA",
  },
  {
    countryCode: "MLI",
    countryName: "Mali",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "BFA",
    countryName: "Burkina Faso",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "NER",
    countryName: "Niger",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "GIN",
    countryName: "Guinea",
    currencyCode: "GNF",
    currencyName: "Guinean Franc",
    currencySymbol: "FG",
  },
  {
    countryCode: "BEN",
    countryName: "Benin",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "TGO",
    countryName: "Togo",
    currencyCode: "XOF",
    currencyName: "West African CFA",
    currencySymbol: "CFA",
  },
  {
    countryCode: "SLE",
    countryName: "Sierra Leone",
    currencyCode: "SLE",
    currencyName: "Sierra Leonean Leone",
    currencySymbol: "Le",
  },
  {
    countryCode: "LBR",
    countryName: "Liberia",
    currencyCode: "LRD",
    currencyName: "Liberian Dollar",
    currencySymbol: "L$",
  },
  {
    countryCode: "GMB",
    countryName: "Gambia",
    currencyCode: "GMD",
    currencyName: "Gambian Dalasi",
    currencySymbol: "D",
  },
  {
    countryCode: "GAB",
    countryName: "Gabon",
    currencyCode: "XAF",
    currencyName: "Central African CFA",
    currencySymbol: "FCFA",
  },
  {
    countryCode: "GNQ",
    countryName: "Equatorial Guinea",
    currencyCode: "XAF",
    currencyName: "Central African CFA",
    currencySymbol: "FCFA",
  },
  {
    countryCode: "TCD",
    countryName: "Chad",
    currencyCode: "XAF",
    currencyName: "Central African CFA",
    currencySymbol: "FCFA",
  },
  {
    countryCode: "CAF",
    countryName: "Central African Republic",
    currencyCode: "XAF",
    currencyName: "Central African CFA",
    currencySymbol: "FCFA",
  },
  {
    countryCode: "MRT",
    countryName: "Mauritania",
    currencyCode: "MRU",
    currencyName: "Mauritanian Ouguiya",
    currencySymbol: "UM",
  },

  // North Africa & Middle East
  {
    countryCode: "EGY",
    countryName: "Egypt",
    currencyCode: "EGP",
    currencyName: "Egyptian Pound",
    currencySymbol: "E£",
  },
  {
    countryCode: "MAR",
    countryName: "Morocco",
    currencyCode: "MAD",
    currencyName: "Moroccan Dirham",
    currencySymbol: "د.م.",
  },
  {
    countryCode: "DZA",
    countryName: "Algeria",
    currencyCode: "DZD",
    currencyName: "Algerian Dinar",
    currencySymbol: "د.ج",
  },
  {
    countryCode: "TUN",
    countryName: "Tunisia",
    currencyCode: "TND",
    currencyName: "Tunisian Dinar",
    currencySymbol: "د.ت",
  },
  { countryCode: "LBY", countryName: "Libya", currencyCode: "LYD", currencyName: "Libyan Dinar", currencySymbol: "LD" },
  {
    countryCode: "UAE",
    countryName: "United Arab Emirates",
    currencyCode: "AED",
    currencyName: "UAE Dirham",
    currencySymbol: "د.إ",
  },
  {
    countryCode: "SAU",
    countryName: "Saudi Arabia",
    currencyCode: "SAR",
    currencyName: "Saudi Riyal",
    currencySymbol: "﷼",
  },
  {
    countryCode: "QAT",
    countryName: "Qatar",
    currencyCode: "QAR",
    currencyName: "Qatari Riyal",
    currencySymbol: "ر.ق",
  },
  {
    countryCode: "KWT",
    countryName: "Kuwait",
    currencyCode: "KWD",
    currencyName: "Kuwaiti Dinar",
    currencySymbol: "د.ك",
  },
  { countryCode: "OMN", countryName: "Oman", currencyCode: "OMR", currencyName: "Omani Rial", currencySymbol: "ر.ع." },
  {
    countryCode: "BHR",
    countryName: "Bahrain",
    currencyCode: "BHD",
    currencyName: "Bahraini Dinar",
    currencySymbol: ".د.ب",
  },
  {
    countryCode: "JOR",
    countryName: "Jordan",
    currencyCode: "JOD",
    currencyName: "Jordanian Dinar",
    currencySymbol: "JD",
  },
  {
    countryCode: "LBN",
    countryName: "Lebanon",
    currencyCode: "LBP",
    currencyName: "Lebanese Pound",
    currencySymbol: "LL",
  },
  { countryCode: "IRQ", countryName: "Iraq", currencyCode: "IQD", currencyName: "Iraqi Dinar", currencySymbol: "ع.د" },
  { countryCode: "SYR", countryName: "Syria", currencyCode: "SYP", currencyName: "Syrian Pound", currencySymbol: "LS" },
  { countryCode: "YEM", countryName: "Yemen", currencyCode: "YER", currencyName: "Yemeni Rial", currencySymbol: "﷼" },
  { countryCode: "TUR", countryName: "Turkey", currencyCode: "TRY", currencyName: "Turkish Lira", currencySymbol: "₺" },
  { countryCode: "IRN", countryName: "Iran", currencyCode: "IRR", currencyName: "Iranian Rial", currencySymbol: "﷼" },
  {
    countryCode: "ISR",
    countryName: "Israel",
    currencyCode: "ILS",
    currencyName: "Israeli Shekel",
    currencySymbol: "₪",
  },
  {
    countryCode: "PSE",
    countryName: "Palestine",
    currencyCode: "ILS",
    currencyName: "Israeli Shekel",
    currencySymbol: "₪",
  },

  // Americas
  {
    countryCode: "USA",
    countryName: "United States",
    currencyCode: "USD",
    currencyName: "US Dollar",
    currencySymbol: "$",
  },
  {
    countryCode: "CAN",
    countryName: "Canada",
    currencyCode: "CAD",
    currencyName: "Canadian Dollar",
    currencySymbol: "CA$",
  },
  { countryCode: "MEX", countryName: "Mexico", currencyCode: "MXN", currencyName: "Mexican Peso", currencySymbol: "$" },
  {
    countryCode: "BRA",
    countryName: "Brazil",
    currencyCode: "BRL",
    currencyName: "Brazilian Real",
    currencySymbol: "R$",
  },
  {
    countryCode: "ARG",
    countryName: "Argentina",
    currencyCode: "ARS",
    currencyName: "Argentine Peso",
    currencySymbol: "$",
  },
  {
    countryCode: "COL",
    countryName: "Colombia",
    currencyCode: "COP",
    currencyName: "Colombian Peso",
    currencySymbol: "$",
  },
  { countryCode: "CHL", countryName: "Chile", currencyCode: "CLP", currencyName: "Chilean Peso", currencySymbol: "$" },
  { countryCode: "PER", countryName: "Peru", currencyCode: "PEN", currencyName: "Peruvian Sol", currencySymbol: "S/" },
  { countryCode: "ECU", countryName: "Ecuador", currencyCode: "USD", currencyName: "US Dollar", currencySymbol: "$" },
  {
    countryCode: "VEN",
    countryName: "Venezuela",
    currencyCode: "VES",
    currencyName: "Venezuelan Bolívar",
    currencySymbol: "Bs.",
  },
  {
    countryCode: "BOL",
    countryName: "Bolivia",
    currencyCode: "BOB",
    currencyName: "Bolivian Boliviano",
    currencySymbol: "Bs",
  },
  {
    countryCode: "PRY",
    countryName: "Paraguay",
    currencyCode: "PYG",
    currencyName: "Paraguayan Guaraní",
    currencySymbol: "₲",
  },
  {
    countryCode: "URY",
    countryName: "Uruguay",
    currencyCode: "UYU",
    currencyName: "Uruguayan Peso",
    currencySymbol: "$U",
  },
  { countryCode: "PAN", countryName: "Panama", currencyCode: "USD", currencyName: "US Dollar", currencySymbol: "$" },
  {
    countryCode: "CRI",
    countryName: "Costa Rica",
    currencyCode: "CRC",
    currencyName: "Costa Rican Colón",
    currencySymbol: "₡",
  },
  {
    countryCode: "GTM",
    countryName: "Guatemala",
    currencyCode: "GTQ",
    currencyName: "Guatemalan Quetzal",
    currencySymbol: "Q",
  },
  {
    countryCode: "DOM",
    countryName: "Dominican Republic",
    currencyCode: "DOP",
    currencyName: "Dominican Peso",
    currencySymbol: "RD$",
  },
  {
    countryCode: "JAM",
    countryName: "Jamaica",
    currencyCode: "JMD",
    currencyName: "Jamaican Dollar",
    currencySymbol: "J$",
  },
  { countryCode: "CUB", countryName: "Cuba", currencyCode: "CUP", currencyName: "Cuban Peso", currencySymbol: "$" },
  {
    countryCode: "HTI",
    countryName: "Haiti",
    currencyCode: "HTG",
    currencyName: "Haitian Gourde",
    currencySymbol: "G",
  },
  {
    countryCode: "HND",
    countryName: "Honduras",
    currencyCode: "HNL",
    currencyName: "Honduran Lempira",
    currencySymbol: "L",
  },
  {
    countryCode: "NIC",
    countryName: "Nicaragua",
    currencyCode: "NIO",
    currencyName: "Nicaraguan Córdoba",
    currencySymbol: "C$",
  },
  {
    countryCode: "SLV",
    countryName: "El Salvador",
    currencyCode: "USD",
    currencyName: "US Dollar",
    currencySymbol: "$",
  },
  {
    countryCode: "TTO",
    countryName: "Trinidad and Tobago",
    currencyCode: "TTD",
    currencyName: "Trinidadian Dollar",
    currencySymbol: "TT$",
  },
  {
    countryCode: "BHS",
    countryName: "Bahamas",
    currencyCode: "BSD",
    currencyName: "Bahamian Dollar",
    currencySymbol: "B$",
  },
  {
    countryCode: "BRB",
    countryName: "Barbados",
    currencyCode: "BBD",
    currencyName: "Barbadian Dollar",
    currencySymbol: "Bds$",
  },
  {
    countryCode: "GUY",
    countryName: "Guyana",
    currencyCode: "GYD",
    currencyName: "Guyanese Dollar",
    currencySymbol: "G$",
  },
  {
    countryCode: "SUR",
    countryName: "Suriname",
    currencyCode: "SRD",
    currencyName: "Surinamese Dollar",
    currencySymbol: "Sr$",
  },

  // Europe & UK
  {
    countryCode: "GBR",
    countryName: "United Kingdom",
    currencyCode: "GBP",
    currencyName: "British Pound",
    currencySymbol: "£",
  },
  { countryCode: "EUR", countryName: "European Union", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "DEU", countryName: "Germany", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "FRA", countryName: "France", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "ITA", countryName: "Italy", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "ESP", countryName: "Spain", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "NLD", countryName: "Netherlands", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  {
    countryCode: "CHE",
    countryName: "Switzerland",
    currencyCode: "CHF",
    currencyName: "Swiss Franc",
    currencySymbol: "CHF",
  },
  {
    countryCode: "SWE",
    countryName: "Sweden",
    currencyCode: "SEK",
    currencyName: "Swedish Krona",
    currencySymbol: "kr",
  },
  {
    countryCode: "NOR",
    countryName: "Norway",
    currencyCode: "NOK",
    currencyName: "Norwegian Krone",
    currencySymbol: "kr",
  },
  {
    countryCode: "DNK",
    countryName: "Denmark",
    currencyCode: "DKK",
    currencyName: "Danish Krone",
    currencySymbol: "kr",
  },
  {
    countryCode: "POL",
    countryName: "Poland",
    currencyCode: "PLN",
    currencyName: "Polish Zloty",
    currencySymbol: "zł",
  },
  { countryCode: "BEL", countryName: "Belgium", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "AUT", countryName: "Austria", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "IRL", countryName: "Ireland", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "PRT", countryName: "Portugal", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "GRC", countryName: "Greece", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "FIN", countryName: "Finland", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  {
    countryCode: "CZE",
    countryName: "Czech Republic",
    currencyCode: "CZK",
    currencyName: "Czech Koruna",
    currencySymbol: "Kč",
  },
  {
    countryCode: "ROU",
    countryName: "Romania",
    currencyCode: "RON",
    currencyName: "Romanian Leu",
    currencySymbol: "lei",
  },
  {
    countryCode: "HUN",
    countryName: "Hungary",
    currencyCode: "HUF",
    currencyName: "Hungarian Forint",
    currencySymbol: "Ft",
  },
  {
    countryCode: "UKR",
    countryName: "Ukraine",
    currencyCode: "UAH",
    currencyName: "Ukrainian Hryvnia",
    currencySymbol: "₴",
  },
  {
    countryCode: "RUS",
    countryName: "Russia",
    currencyCode: "RUB",
    currencyName: "Russian Ruble",
    currencySymbol: "₽",
  },
  {
    countryCode: "BLR",
    countryName: "Belarus",
    currencyCode: "BYN",
    currencyName: "Belarusian Ruble",
    currencySymbol: "Br",
  },
  {
    countryCode: "SRB",
    countryName: "Serbia",
    currencyCode: "RSD",
    currencyName: "Serbian Dinar",
    currencySymbol: "дин.",
  },
  {
    countryCode: "BGR",
    countryName: "Bulgaria",
    currencyCode: "BGN",
    currencyName: "Bulgarian Lev",
    currencySymbol: "лв",
  },
  { countryCode: "HRV", countryName: "Croatia", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "SVK", countryName: "Slovakia", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "SVN", countryName: "Slovenia", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "LTU", countryName: "Lithuania", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "LVA", countryName: "Latvia", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "EST", countryName: "Estonia", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "CYP", countryName: "Cyprus", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { countryCode: "MLT", countryName: "Malta", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  {
    countryCode: "ISL",
    countryName: "Iceland",
    currencyCode: "ISK",
    currencyName: "Icelandic Krona",
    currencySymbol: "kr",
  },
  {
    countryCode: "ALB",
    countryName: "Albania",
    currencyCode: "ALL",
    currencyName: "Albanian Lek",
    currencySymbol: "L",
  },
  {
    countryCode: "BIH",
    countryName: "Bosnia and Herzegovina",
    currencyCode: "BAM",
    currencyName: "Convertible Mark",
    currencySymbol: "KM",
  },
  {
    countryCode: "MKD",
    countryName: "North Macedonia",
    currencyCode: "MKD",
    currencyName: "Macedonian Denar",
    currencySymbol: "ден",
  },
  { countryCode: "MNE", countryName: "Montenegro", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  {
    countryCode: "MDA",
    countryName: "Moldova",
    currencyCode: "MDL",
    currencyName: "Moldovan Leu",
    currencySymbol: "L",
  },
  {
    countryCode: "GEO",
    countryName: "Georgia",
    currencyCode: "GEL",
    currencyName: "Georgian Lari",
    currencySymbol: "₾",
  },
  {
    countryCode: "ARM",
    countryName: "Armenia",
    currencyCode: "AMD",
    currencyName: "Armenian Dram",
    currencySymbol: "֏",
  },
  {
    countryCode: "AZE",
    countryName: "Azerbaijan",
    currencyCode: "AZN",
    currencyName: "Azerbaijani Manat",
    currencySymbol: "₼",
  },

  // Asia & Oceania
  { countryCode: "IND", countryName: "India", currencyCode: "INR", currencyName: "Indian Rupee", currencySymbol: "₹" },
  { countryCode: "CHN", countryName: "China", currencyCode: "CNY", currencyName: "Chinese Yuan", currencySymbol: "¥" },
  { countryCode: "JPN", countryName: "Japan", currencyCode: "JPY", currencyName: "Japanese Yen", currencySymbol: "¥" },
  {
    countryCode: "PAK",
    countryName: "Pakistan",
    currencyCode: "PKR",
    currencyName: "Pakistani Rupee",
    currencySymbol: "₨",
  },
  {
    countryCode: "BGD",
    countryName: "Bangladesh",
    currencyCode: "BDT",
    currencyName: "Bangladeshi Taka",
    currencySymbol: "৳",
  },
  {
    countryCode: "IDN",
    countryName: "Indonesia",
    currencyCode: "IDR",
    currencyName: "Indonesian Rupiah",
    currencySymbol: "Rp",
  },
  {
    countryCode: "MYS",
    countryName: "Malaysia",
    currencyCode: "MYR",
    currencyName: "Malaysian Ringgit",
    currencySymbol: "RM",
  },
  {
    countryCode: "SGP",
    countryName: "Singapore",
    currencyCode: "SGD",
    currencyName: "Singapore Dollar",
    currencySymbol: "S$",
  },
  {
    countryCode: "PHL",
    countryName: "Philippines",
    currencyCode: "PHP",
    currencyName: "Philippine Peso",
    currencySymbol: "₱",
  },
  {
    countryCode: "VNM",
    countryName: "Vietnam",
    currencyCode: "VND",
    currencyName: "Vietnamese Dong",
    currencySymbol: "₫",
  },
  { countryCode: "THA", countryName: "Thailand", currencyCode: "THB", currencyName: "Thai Baht", currencySymbol: "฿" },
  {
    countryCode: "KOR",
    countryName: "South Korea",
    currencyCode: "KRW",
    currencyName: "South Korean Won",
    currencySymbol: "₩",
  },
  {
    countryCode: "LKA",
    countryName: "Sri Lanka",
    currencyCode: "LKR",
    currencyName: "Sri Lankan Rupee",
    currencySymbol: "Rs",
  },
  {
    countryCode: "NPL",
    countryName: "Nepal",
    currencyCode: "NPR",
    currencyName: "Nepalese Rupee",
    currencySymbol: "Rs",
  },
  {
    countryCode: "MMR",
    countryName: "Myanmar",
    currencyCode: "MMK",
    currencyName: "Myanmar Kyat",
    currencySymbol: "K",
  },
  {
    countryCode: "KHM",
    countryName: "Cambodia",
    currencyCode: "KHR",
    currencyName: "Cambodian Riel",
    currencySymbol: "៛",
  },
  { countryCode: "LAO", countryName: "Laos", currencyCode: "LAK", currencyName: "Lao Kip", currencySymbol: "₭" },
  {
    countryCode: "AFG",
    countryName: "Afghanistan",
    currencyCode: "AFN",
    currencyName: "Afghan Afghani",
    currencySymbol: "؋",
  },
  {
    countryCode: "KAZ",
    countryName: "Kazakhstan",
    currencyCode: "KZT",
    currencyName: "Kazakhstani Tenge",
    currencySymbol: "₸",
  },
  {
    countryCode: "UZB",
    countryName: "Uzbekistan",
    currencyCode: "UZS",
    currencyName: "Uzbekistani Som",
    currencySymbol: "so'm",
  },
  {
    countryCode: "TKM",
    countryName: "Turkmenistan",
    currencyCode: "TMT",
    currencyName: "Turkmenistani Manat",
    currencySymbol: "T",
  },
  {
    countryCode: "KGZ",
    countryName: "Kyrgyzstan",
    currencyCode: "KGS",
    currencyName: "Kyrgyzstani Som",
    currencySymbol: "с",
  },
  {
    countryCode: "TJK",
    countryName: "Tajikistan",
    currencyCode: "TJS",
    currencyName: "Tajikistani Somoni",
    currencySymbol: "SM",
  },
  {
    countryCode: "MNG",
    countryName: "Mongolia",
    currencyCode: "MNT",
    currencyName: "Mongolian Tugrik",
    currencySymbol: "₮",
  },
  {
    countryCode: "MDV",
    countryName: "Maldives",
    currencyCode: "MVR",
    currencyName: "Maldivian Rufiyaa",
    currencySymbol: "Rf",
  },
  {
    countryCode: "BTN",
    countryName: "Bhutan",
    currencyCode: "BTN",
    currencyName: "Bhutanese Ngultrum",
    currencySymbol: "Nu.",
  },
  {
    countryCode: "BRN",
    countryName: "Brunei",
    currencyCode: "BND",
    currencyName: "Brunei Dollar",
    currencySymbol: "B$",
  },
  {
    countryCode: "AUS",
    countryName: "Australia",
    currencyCode: "AUD",
    currencyName: "Australian Dollar",
    currencySymbol: "A$",
  },
  {
    countryCode: "NZL",
    countryName: "New Zealand",
    currencyCode: "NZD",
    currencyName: "New Zealand Dollar",
    currencySymbol: "NZ$",
  },
  {
    countryCode: "PNG",
    countryName: "Papua New Guinea",
    currencyCode: "PGK",
    currencyName: "Papua New Guinean Kina",
    currencySymbol: "K",
  },
  {
    countryCode: "FJI",
    countryName: "Fiji",
    currencyCode: "FJD",
    currencyName: "Fijian Dollar",
    currencySymbol: "FJ$",
  },
];

export function searchCurrencies(query: string): WorldCountryCurrency[] {
  const q = query.trim().toLowerCase();
  if (!q) return WORLD_COUNTRIES_CURRENCIES;
  return WORLD_COUNTRIES_CURRENCIES.filter(
    (c) =>
      c.currencyCode.toLowerCase().includes(q) ||
      c.currencyName.toLowerCase().includes(q) ||
      c.countryName.toLowerCase().includes(q) ||
      c.countryCode.toLowerCase().includes(q),
  );
}

export function searchCountries(query: string): WorldCountryCurrency[] {
  const q = query.trim().toLowerCase();
  if (!q) return WORLD_COUNTRIES_CURRENCIES;
  return WORLD_COUNTRIES_CURRENCIES.filter(
    (c) =>
      c.countryName.toLowerCase().includes(q) ||
      c.countryCode.toLowerCase().includes(q) ||
      c.currencyCode.toLowerCase().includes(q),
  );
}

export function findByCurrency(currencyCode: string): WorldCountryCurrency | undefined {
  return WORLD_COUNTRIES_CURRENCIES.find((c) => c.currencyCode.toUpperCase() === currencyCode.toUpperCase());
}

export function findByCountry(countryCode: string): WorldCountryCurrency | undefined {
  return WORLD_COUNTRIES_CURRENCIES.find((c) => c.countryCode.toUpperCase() === countryCode.toUpperCase());
}

/**
 * Automatically detects the user's country and currency from system timezone and browser locale.
 * Defaults to Kenya (KEN / KSH) if undetermined.
 */
export function detectUserCountry(): { countryCode: string; currencyCode: string } {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const tzMap: Record<string, { country: string; curr: string }> = {
      // East & Central Africa
      "Africa/Nairobi": { country: "KEN", curr: "KSH" },
      "Africa/Mogadishu": { country: "SOM", curr: "SOM" },
      "Africa/Kampala": { country: "UGA", curr: "USH" },
      "Africa/Dar_es_Salaam": { country: "TZA", curr: "TSH" },
      "Africa/Kigali": { country: "RWA", curr: "RWF" },
      "Africa/Addis_Ababa": { country: "ETH", curr: "ETB" },
      "Africa/Djibouti": { country: "DJI", curr: "DJF" },
      "Africa/Juba": { country: "SSD", curr: "SSP" },
      "Africa/Khartoum": { country: "SDN", curr: "SDG" },
      "Africa/Asmara": { country: "ERI", curr: "ERN" },
      "Africa/Bujumbura": { country: "BDI", curr: "BIF" },
      "Africa/Kinshasa": { country: "COD", curr: "CDF" },
      "Africa/Lubumbashi": { country: "COD", curr: "CDF" },

      // Middle East & North Africa
      "Asia/Dubai": { country: "UAE", curr: "AED" },
      "Asia/Riyadh": { country: "SAU", curr: "SAR" },
      "Asia/Qatar": { country: "QAT", curr: "QAR" },
      "Asia/Kuwait": { country: "KWT", curr: "KWD" },
      "Asia/Muscat": { country: "OMN", curr: "OMR" },
      "Asia/Bahrain": { country: "BHR", curr: "BHD" },
      "Africa/Cairo": { country: "EGY", curr: "EGP" },
      "Africa/Casablanca": { country: "MAR", curr: "MAD" },
      "Africa/Algiers": { country: "DZA", curr: "DZD" },
      "Africa/Tunis": { country: "TUN", curr: "TND" },

      // Southern & West Africa
      "Africa/Lagos": { country: "NGA", curr: "NGN" },
      "Africa/Accra": { country: "GHA", curr: "GHS" },
      "Africa/Johannesburg": { country: "ZAF", curr: "ZAR" },
      "Africa/Lusaka": { country: "ZMB", curr: "ZMW" },
      "Africa/Harare": { country: "ZWE", curr: "ZWL" },
      "Africa/Maputo": { country: "MOZ", curr: "MZN" },
      "Africa/Windhoek": { country: "NAM", curr: "NAD" },
      "Africa/Gaborone": { country: "BWA", curr: "BWP" },
      "Africa/Dakar": { country: "SEN", curr: "XOF" },
      "Africa/Abidjan": { country: "CIV", curr: "XOF" },
      "Africa/Douala": { country: "CMR", curr: "XAF" },

      // Major Global Metros
      "Europe/London": { country: "GBR", curr: "GBP" },
      "Asia/Kolkata": { country: "IND", curr: "INR" },
      "Asia/Shanghai": { country: "CHN", curr: "CNY" },
      "Asia/Tokyo": { country: "JPN", curr: "JPY" },
      "Asia/Seoul": { country: "KOR", curr: "KRW" },
      "Asia/Singapore": { country: "SGP", curr: "SGD" },
      "Asia/Kuala_Lumpur": { country: "MYS", curr: "MYR" },
      "Asia/Jakarta": { country: "IDN", curr: "IDR" },
      "Asia/Bangkok": { country: "THA", curr: "THB" },
      "Asia/Manila": { country: "PHL", curr: "PHP" },
      "Asia/Karachi": { country: "PAK", curr: "PKR" },
      "Asia/Dhaka": { country: "BGD", curr: "BDT" },
      "Asia/Colombo": { country: "LKA", curr: "LKR" },
      "Australia/Sydney": { country: "AUS", curr: "AUD" },
      "Pacific/Auckland": { country: "NZL", curr: "NZD" },
      "America/Toronto": { country: "CAN", curr: "CAD" },
      "America/Vancouver": { country: "CAN", curr: "CAD" },
      "America/Sao_Paulo": { country: "BRA", curr: "BRL" },
      "America/Mexico_City": { country: "MEX", curr: "MXN" },
    };

    if (tzMap[timeZone]) {
      return { countryCode: tzMap[timeZone].country, currencyCode: tzMap[timeZone].curr };
    }

    if (timeZone.startsWith("America/")) {
      return { countryCode: "USA", currencyCode: "USD" };
    }
    if (timeZone.startsWith("Europe/")) {
      return { countryCode: "EUR", currencyCode: "EUR" };
    }

    // Locale fallback from navigator.language (e.g. en-KE -> KEN)
    const lang = (typeof navigator !== "undefined" ? navigator.language || "" : "").toUpperCase();
    if (lang.includes("-KE")) return { countryCode: "KEN", currencyCode: "KSH" };
    if (lang.includes("-SO")) return { countryCode: "SOM", currencyCode: "SOM" };
    if (lang.includes("-UG")) return { countryCode: "UGA", currencyCode: "USH" };
    if (lang.includes("-TZ")) return { countryCode: "TZA", currencyCode: "TSH" };
    if (lang.includes("-AE")) return { countryCode: "UAE", currencyCode: "AED" };
    if (lang.includes("-US")) return { countryCode: "USA", currencyCode: "USD" };
    if (lang.includes("-GB")) return { countryCode: "GBR", currencyCode: "GBP" };
  } catch {
    // Non-blocking fallback
  }

  return { countryCode: "KEN", currencyCode: "KSH" };
}
