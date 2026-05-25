export type Category = "Tech" | "Business" | "Travel" | "Daily Life";

/** Whole-word matches (highest priority). */
const EXACT: Record<Exclude<Category, "Daily Life">, ReadonlySet<string>> = {
  Tech: new Set(
    [
      "app", "application", "artificial", "automation", "bandwidth", "browser", "byte",
      "cloud", "code", "coding", "computer", "cyber", "cybersecurity", "data", "database",
      "digital", "download", "email", "hardware", "internet", "keyboard", "laptop",
      "network", "online", "password", "phone", "pixel", "program", "programming",
      "robot", "robotics", "screen", "server", "smartphone", "software", "tablet",
      "tech", "technology", "upload", "user", "website", "wifi", "wireless", "algorithm",
      "analytics", "android", "api", "automation", "blockchain", "bug", "cache",
      "chip", "click", "computing", "cursor", "debug", "developer", "device", "disk",
      "domain", "electronics", "engineer", "engineering", "file", "firewall", "gadget",
      "hack", "hacker", "innovation", "interface", "internet", "ios", "java", "javascript",
      "laser", "login", "malware", "microchip", "mobile", "modem", "monitor", "online",
      "plugin", "processor", "python", "router", "satellite", "semiconductor", "sensor",
      "simulation", "smart", "startup", "storage", "streaming", "tech", "telecom",
      "template", "terminal", "username", "video", "virtual", "virus", "web", "website",
      "wireless", "android", "binary", "bitcoin", "bluetooth", "coding", "cpu", "crypto",
      "database", "digital", "email", "encryption", "github", "gpu", "hackathon", "html",
      "information", "instagram", "intel", "iphone", "it", "java", "linux", "mac", "meta",
      "microsoft", "online", "pc", "pdf", "pixel", "podcast", "python", "reddit",
      "robot", "saas", "seo", "silicon", "simulator", "snapchat", "software", "spam",
      "spotify", "startup", "steam", "tech", "telegram", "tiktok", "twitter", "usb",
      "virus", "vpn", "webinar", "whatsapp", "windows", "wordpress", "youtube", "zoom",
      "science", "scientist", "laboratory", "lab", "experiment", "research", "innovate",
      "innovation", "machine", "electric", "electronic", "electricity", "energy",
      "battery", "solar", "nuclear", "physics", "chemistry", "biology", "mathematics",
      "math", "statistics", "calculate", "calculator", "formula", "graph", "chart",
    ].map((w) => w.toLowerCase()),
  ),
  Business: new Set(
    [
      "account", "accounting", "asset", "bank", "banking", "boss", "brand", "budget",
      "business", "buy", "buyer", "capital", "career", "cash", "client", "commerce",
      "commercial", "company", "contract", "corporate", "cost", "customer", "deal",
      "debt", "dividend", "economy", "economic", "employee", "employer", "employment",
      "enterprise", "entrepreneur", "expense", "export", "finance", "financial", "fund",
      "funding", "hire", "import", "income", "industry", "insurance", "invest",
      "investment", "investor", "invoice", "job", "loan", "manager", "management",
      "market", "marketing", "merger", "money", "mortgage", "negotiate", "office",
      "pay", "payment", "payroll", "price", "pricing", "profit", "purchase", "retail",
      "revenue", "salary", "sale", "sales", "sell", "seller", "share", "stock", "stocks",
      "startup", "strategy", "supplier", "supply", "tax", "taxes", "trade", "trading",
      "transaction", "wage", "wholesale", "work", "workplace", "workforce", "yield",
      "audit", "balance", "bankrupt", "bonus", "broker", "budget", "ceo", "cfo",
      "chairman", "commission", "competition", "competitor", "consumer", "corporation",
      "credit", "currency", "deficit", "demand", "discount", "distribution", "dividend",
      "earnings", "equity", "exchange", "executive", "franchise", "gdp", "goods",
      "growth", "hr", "inflation", "interest", "inventory", "labor", "labour", "lease",
      "liability", "logistics", "margin", "merchandise", "monopoly", "partnership",
      "patent", "pension", "portfolio", "premium", "product", "production", "profit",
      "promotion", "prospectus", "quota", "recession", "recruit", "recruitment",
      "refund", "retail", "risk", "salary", "sector", "shareholder", "stakeholder",
      "subsidy", "surplus", "tariff", "trade", "turnover", "union", "venture",
      "warehouse", "wholesale",
    ].map((w) => w.toLowerCase()),
  ),
  Travel: new Set(
    [
      "abroad", "airline", "airplane", "airport", "arrival", "backpack", "baggage",
      "beach", "bicycle", "bike", "boarding", "boat", "border", "bus", "cab", "cabin",
      "camp", "camping", "car", "coach", "compass", "cruise", "customs", "departure",
      "destination", "drive", "driver", "driving", "excursion", "explore", "ferry",
      "flight", "fly", "foreign", "guide", "highway", "hike", "hiking", "holiday",
      "hostel", "hotel", "immigration", "island", "itinerary", "journey", "landmark",
      "luggage", "map", "metro", "motel", "mountain", "museum", "navigate", "navigation",
      "overseas", "passport", "pilot", "plane", "rail", "railway", "reservation",
      "resort", "restaurant", "road", "route", "sailing", "ship", "sightseeing",
      "station", "subway", "suitcase", "taxi", "ticket", "tour", "tourism", "tourist",
      "train", "tram", "transit", "transport", "transportation", "travel", "traveler",
      "traveller", "trip", "vacation", "vehicle", "visa", "visit", "visitor", "voyage",
      "aircraft", "airfare", "bag", "baggage", "booking", "border", "brochure",
      "camper", "campsite", "check-in", "checkout", "coast", "continent", "cruise",
      "delay", "depart", "dock", "embassy", "fare", "flight", "gate", "gear", "globe",
      "harbor", "harbour", "hitchhike", "hostel", "inn", "jet", "lag", "land", "lane",
      "layover", "lodge", "luggage", "mile", "mileage",       "motorway", "national",
      "passenger", "path", "pier", "platform", "port", "railroad", "rental", "resort",
      "river", "road", "runway", "safari", "schedule", "seat", "souvenir", "station",
      "stopover", "subway", "terminal", "ticket", "timetable", "tour", "trail", "tram",
      "transit", "trek", "trip", "tunnel", "visa", "voyage", "wander",
    ].map((w) => w.toLowerCase()),
  ),
};

/** Substrings only matched on word boundaries (avoids "work" in "network"). */
const BOUNDARY: Record<Exclude<Category, "Daily Life">, readonly string[]> = {
  Tech: [
    "tech", "digital", "online", "software", "hardware", "network", "cyber", "data",
    "computer", "program", "electronic", "robot", "cloud", "web", "internet", "code",
    "pixel", "server", "app", "crypto", "virtual", "smart", "automate", "compute",
  ],
  Business: [
    "business", "finance", "market", "econom", "corporate", "invest", "bank", "trade",
    "commerce", "salary", "profit", "revenue", "tax", "budget", "invoice", "employ",
    "commercial", "retail", "wholesale", "stock", "dividend", "account", "payroll",
  ],
  Travel: [
    "travel", "tourist", "airport", "flight", "hotel", "passport", "journey", "vacation",
    "holiday", "luggage", "cruise", "airline", "railway", "highway", "sightsee",
    "backpack", "itinerary", "visa", "abroad", "ferry", "taxi", "transit",
  ],
};

const BOUNDARY_REGEX = (() => {
  const out: Record<Exclude<Category, "Daily Life">, RegExp[]> = {
    Tech: [],
    Business: [],
    Travel: [],
  };
  for (const cat of ["Tech", "Business", "Travel"] as const) {
    for (const token of BOUNDARY[cat]) {
      out[cat].push(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
    }
  }
  return out;
})();

const EXAMPLE_HINTS: { pattern: RegExp; category: Exclude<Category, "Daily Life"> }[] = [
  { pattern: /\b(airport|flight|hotel|passport|visa|luggage|tourist)\b/i, category: "Travel" },
  { pattern: /\b(company|office|salary|profit|invest|market|bank|tax)\b/i, category: "Business" },
  { pattern: /\b(computer|software|internet|website|app|digital|online|data)\b/i, category: "Tech" },
];

function normalize(word: string) {
  return word.trim().toLowerCase().replace(/['']/g, "'");
}

/**
 * Classify vocabulary into app study categories.
 * Priority: exact lists → example hints → boundary tokens → Daily Life.
 */
export function getWordCategory(word: string, exampleSentence?: string): Category {
  const w = normalize(word);

  for (const cat of ["Tech", "Business", "Travel"] as const) {
    if (EXACT[cat].has(w)) return cat;
  }

  const example = exampleSentence ?? "";
  for (const hint of EXAMPLE_HINTS) {
    if (hint.pattern.test(example)) return hint.category;
  }

  // Boundary checks — Travel before Business (fewer false positives on "market street")
  for (const cat of ["Travel", "Business", "Tech"] as const) {
    if (BOUNDARY_REGEX[cat].some((rx) => rx.test(w))) return cat;
  }

  return "Daily Life";
}
