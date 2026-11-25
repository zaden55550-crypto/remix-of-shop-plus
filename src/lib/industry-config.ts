/**
 * Approved business catalogue and industry configuration for DATAQUILL SOLUTIONS.
 *
 * This is a data/configuration foundation only. Trade remains the existing ERP
 * core; other industries are explicitly marked configuration-only until their
 * workflows are implemented. Do not use those planned modules as a signal that
 * unfinished features are available to users.
 */

export const INDUSTRY_FAMILY_IDS = [
  "trade",
  "manufacturing",
  "hospitality",
  "services",
  "property-construction",
  "logistics",
  "education",
  "healthcare",
] as const;

export type IndustryFamilyId = (typeof INDUSTRY_FAMILY_IDS)[number];

export const EXISTING_TRADE_APP_IDS = [
  "dashboard",
  "inventory",
  "purchases",
  "sales",
  "pos",
  "expenses",
  "contacts",
  "float",
  "accounting",
  "payroll",
  "reports",
  "summary",
  "settings",
] as const;

/** Proposed shared app ids are registry labels only, not implemented apps. */
export const PLANNED_INDUSTRY_APP_IDS = [
  "frontDesk",
  "production",
  "fleet",
  "services",
  "properties",
  "projects",
  "students",
  "patients",
  "pharmacy",
  "catering",
] as const;

export type AppId =
  | (typeof EXISTING_TRADE_APP_IDS)[number]
  | (typeof PLANNED_INDUSTRY_APP_IDS)[number];
export type ModuleId = AppId;
export type DepartmentId = string;
export type BusinessTypeId = `${IndustryFamilyId}.${string}`;

export type ProductProfile =
  | "trade-inventory"
  | "manufacturing-inputs-and-finished-goods"
  | "hospitality-stock-and-recipes"
  | "service-catalogue"
  | "property-assets-and-projects"
  | "logistics-fleet-and-cargo"
  | "education-programmes"
  | "healthcare-clinical-supplies";

export type ContactProfile =
  | "customers-and-suppliers"
  | "suppliers-and-business-customers"
  | "guests-and-suppliers"
  | "clients-and-service-providers"
  | "owners-tenants-and-contractors"
  | "shippers-carriers-and-recipients"
  | "students-guardians-and-staff"
  | "patients-providers-and-payers";

export type DepartmentDef = {
  id: DepartmentId;
  name: string;
  module: ModuleId;
  status: "available" | "planned";
};

export type IndustryFamily = {
  id: IndustryFamilyId;
  name: string;
  businessTypeNames: readonly string[];
  requiredApps: readonly AppId[];
  optionalApps: readonly AppId[];
  defaultDepartments: readonly DepartmentDef[];
  productProfile: ProductProfile;
  contactProfile: ContactProfile;
  /** Non-Trade entries are catalogued but their operational ERP modules are not complete. */
  implementationStatus: "existing-trade-core" | "configuration-only";
};

export type BusinessType = {
  id: BusinessTypeId;
  familyId: IndustryFamilyId;
  name: string;
  /** No extra aliases are invented; add only aliases approved by the owner. */
  aliases: readonly string[];
  requiredApps: readonly AppId[];
  optionalApps: readonly AppId[];
  departments: readonly DepartmentDef[];
  productProfile: ProductProfile;
  contactProfile: ContactProfile;
  implementationStatus: IndustryFamily["implementationStatus"];
};

const tradeRequiredApps = ["dashboard", "inventory", "sales", "settings"] as const satisfies readonly AppId[];
const tradeOptionalApps = [
  "purchases", "pos", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary",
] as const satisfies readonly AppId[];
const sharedRequiredApps = ["dashboard", "settings"] as const satisfies readonly AppId[];
const sharedOptionalApps = ["contacts", "expenses", "accounting", "reports"] as const satisfies readonly AppId[];

const tradeDepartments: readonly DepartmentDef[] = [
  { id: "sales", name: "Sales", module: "sales", status: "available" },
  { id: "purchasing", name: "Purchasing", module: "purchases", status: "available" },
  { id: "inventory", name: "Inventory", module: "inventory", status: "available" },
  { id: "point-of-sale", name: "POS", module: "pos", status: "available" },
  { id: "accounting", name: "Accounting", module: "accounting", status: "available" },
  { id: "payroll", name: "Payroll", module: "payroll", status: "available" },
];

/** Exactly the approved eight industries and 111 business names (Trade grew from 15 to 25 on 2026-11-20). */
export const INDUSTRIES: readonly IndustryFamily[] = [
  {
    id: "trade",
    name: "Trade",
    businessTypeNames: [
      "Retail Shop",
      "Supermarket",
      "Wholesale Business",
      "Electronics Shop",
      "Clothing & Fashion Shop",
      "Grocery Store",
      "Hardware Shop",
      "Cosmetics & Beauty Shop",
      "Furniture Shop",
      "Pharmacy",
      "Jewellery Shop",
      "General Merchandise Store",
      "Building Materials Shop",
      "Automotive Parts Shop",
      "Stationery & Bookshop",
      // Added 2026-11-20 on the owner's instruction: every Trade business gets every Trade feature, so these are labels and
      // starting settings only. "General Trade" is what a business that skips the type question is saved as.
      "Agrovet",
      "Butchery",
      "Wines & Spirits",
      "Mobile Phones & Accessories",
      "Shoe Shop",
      "Mitumba (Second-hand Clothes)",
      "Gas / LPG Dealer",
      "Cereals & Grains Shop",
      "Mini-mart / Kiosk",
      "General Trade",
    ],
    requiredApps: tradeRequiredApps,
    optionalApps: tradeOptionalApps,
    defaultDepartments: tradeDepartments,
    productProfile: "trade-inventory",
    contactProfile: "customers-and-suppliers",
    implementationStatus: "existing-trade-core",
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    businessTypeNames: [
      "Food & Beverage Manufacturing",
      "Textile & Garment Manufacturing",
      "Furniture Manufacturing",
      "Pharmaceutical Manufacturing",
      "Packaging Manufacturing",
      "Printing & Publishing",
      "Plastic & Rubber Manufacturing",
      "Metal Fabrication",
      "Chemical Manufacturing",
      "Electronics Manufacturing",
      "Building Materials Manufacturing",
      "General Manufacturing",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "production"],
    defaultDepartments: [
      { id: "production", name: "Production", module: "production", status: "planned" },
      { id: "quality", name: "Quality Control", module: "production", status: "planned" },
      { id: "maintenance", name: "Equipment & Maintenance", module: "production", status: "planned" },
      { id: "procurement", name: "Procurement", module: "purchases", status: "planned" },
    ],
    productProfile: "manufacturing-inputs-and-finished-goods",
    contactProfile: "suppliers-and-business-customers",
    implementationStatus: "configuration-only",
  },
  {
    id: "hospitality",
    name: "Hospitality",
    businessTypeNames: [
      "Hotel",
      "Resort",
      "Lodge",
      "Guesthouse",
      "Serviced Apartments",
      "Boutique Hotel",
      "Restaurant",
      "Café",
      "Catering Business",
      "Bar & Lounge",
      "Fast-Food Business",
      "Event Venue",
      "Banquet & Conference Facility",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "frontDesk", "catering"],
    defaultDepartments: [
      { id: "reservations", name: "Reservations", module: "frontDesk", status: "planned" },
      { id: "front-desk", name: "Front Desk", module: "frontDesk", status: "planned" },
      { id: "housekeeping", name: "Housekeeping", module: "frontDesk", status: "planned" },
      { id: "food-and-beverage", name: "Food & Beverage", module: "catering", status: "planned" },
      { id: "events", name: "Events", module: "catering", status: "planned" },
    ],
    productProfile: "hospitality-stock-and-recipes",
    contactProfile: "guests-and-suppliers",
    implementationStatus: "configuration-only",
  },
  {
    id: "services",
    name: "Services",
    businessTypeNames: [
      "Laundry & Dry Cleaning",
      "Salon & Beauty",
      "Barber Shop",
      "Spa & Wellness",
      "Repair & Maintenance Services",
      "Cleaning Services",
      "Equipment Rental",
      "Vehicle Rental",
      "Professional Services",
      "Photography & Media Services",
      "Printing Services",
      "Consultancy Services",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "services"],
    defaultDepartments: [
      { id: "service-catalogue", name: "Service Catalogue", module: "services", status: "planned" },
      { id: "appointments", name: "Appointments", module: "services", status: "planned" },
      { id: "jobs", name: "Jobs & Work Orders", module: "services", status: "planned" },
      { id: "scheduling", name: "Staff Scheduling", module: "services", status: "planned" },
    ],
    productProfile: "service-catalogue",
    contactProfile: "clients-and-service-providers",
    implementationStatus: "configuration-only",
  },
  {
    id: "property-construction",
    name: "Property & Construction",
    businessTypeNames: [
      "Real Estate Agency",
      "Property Brokerage",
      "Residential Property Sales",
      "Commercial Property Sales",
      "Land Sales",
      "Residential Property Management",
      "Commercial Property Management",
      "Apartment & Estate Management",
      "Residential Rentals",
      "Commercial Rentals",
      "Short-Term Rentals",
      "Property Development",
      "Building Contractor",
      "Civil Construction",
      "Road Construction",
      "Infrastructure Construction",
      "Renovation & Refurbishment",
      "Civil Engineering",
      "Mechanical Engineering",
      "Electrical Engineering",
      "Engineering Consultancy",
      "Facilities Engineering",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "properties", "projects"],
    defaultDepartments: [
      { id: "properties", name: "Properties", module: "properties", status: "planned" },
      { id: "projects", name: "Projects", module: "projects", status: "planned" },
      { id: "tenants", name: "Tenants", module: "properties", status: "planned" },
      { id: "contracts", name: "Contracts", module: "properties", status: "planned" },
      { id: "maintenance", name: "Maintenance", module: "properties", status: "planned" },
    ],
    productProfile: "property-assets-and-projects",
    contactProfile: "owners-tenants-and-contractors",
    implementationStatus: "configuration-only",
  },
  {
    id: "logistics",
    name: "Logistics",
    businessTypeNames: [
      "Transport Company",
      "Logistics Company",
      "Distribution Business",
      "Courier & Delivery Services",
      "Freight Forwarding",
      "Cargo Handling",
      "Fleet Management Business",
      "Warehousing & Storage",
      "Moving & Relocation Services",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "fleet"],
    defaultDepartments: [
      { id: "fleet", name: "Fleet", module: "fleet", status: "planned" },
      { id: "dispatch", name: "Dispatch", module: "fleet", status: "planned" },
      { id: "transport", name: "Transport", module: "fleet", status: "planned" },
      { id: "deliveries", name: "Deliveries", module: "fleet", status: "planned" },
      { id: "warehousing", name: "Warehousing", module: "inventory", status: "planned" },
    ],
    productProfile: "logistics-fleet-and-cargo",
    contactProfile: "shippers-carriers-and-recipients",
    implementationStatus: "configuration-only",
  },
  {
    id: "education",
    name: "Education",
    businessTypeNames: [
      "Primary School",
      "Secondary School",
      "College",
      "University",
      "Technical & Vocational Institution",
      "Training Centre",
      "Early Childhood Education Centre",
      "Online Learning Institution",
      "Professional Training Institution",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "students"],
    defaultDepartments: [
      { id: "students", name: "Students", module: "students", status: "planned" },
      { id: "admissions", name: "Admissions", module: "students", status: "planned" },
      { id: "academics", name: "Academics", module: "students", status: "planned" },
      { id: "fees", name: "Fees", module: "accounting", status: "planned" },
      { id: "staff", name: "Staff", module: "payroll", status: "planned" },
    ],
    productProfile: "education-programmes",
    contactProfile: "students-guardians-and-staff",
    implementationStatus: "configuration-only",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    businessTypeNames: [
      "Medical Clinic",
      "Hospital",
      "Dental Clinic",
      "Medical Laboratory",
      "Diagnostic Centre",
      "Specialist Medical Centre",
      "Physiotherapy Centre",
      "Medical Imaging Centre",
      "Outpatient Centre",
    ],
    requiredApps: sharedRequiredApps,
    optionalApps: [...sharedOptionalApps, "patients", "pharmacy"],
    defaultDepartments: [
      { id: "patients", name: "Patients", module: "patients", status: "planned" },
      { id: "appointments", name: "Appointments", module: "patients", status: "planned" },
      { id: "clinical-operations", name: "Clinical Operations", module: "patients", status: "planned" },
      { id: "billing", name: "Billing", module: "accounting", status: "planned" },
      { id: "pharmacy", name: "Pharmacy", module: "pharmacy", status: "planned" },
    ],
    productProfile: "healthcare-clinical-supplies",
    contactProfile: "patients-providers-and-payers",
    implementationStatus: "configuration-only",
  },
];

/** Exact approved counts by family. Used by tests and startup checks. */
export const EXPECTED_BUSINESS_TYPE_COUNTS: Readonly<Record<IndustryFamilyId, number>> = {
  trade: 25,
  manufacturing: 12,
  hospitality: 13,
  services: 12,
  "property-construction": 22,
  logistics: 9,
  education: 9,
  healthcare: 9,
};

export function slugifyBusinessType(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const BUSINESS_TYPES: readonly BusinessType[] = INDUSTRIES.flatMap((industry) =>
  industry.businessTypeNames.map((name) => ({
    id: `${industry.id}.${slugifyBusinessType(name)}` as BusinessTypeId,
    familyId: industry.id,
    name,
    aliases: [],
    requiredApps: industry.requiredApps,
    optionalApps: industry.optionalApps,
    departments: industry.defaultDepartments,
    productProfile: industry.productProfile,
    contactProfile: industry.contactProfile,
    implementationStatus: industry.implementationStatus,
  })),
);

export function familyOf(id: BusinessTypeId | string): IndustryFamilyId | undefined {
  return BUSINESS_TYPES.find((type) => type.id === id)?.familyId;
}

export function businessTypeById(id: BusinessTypeId | string): BusinessType | undefined {
  return BUSINESS_TYPES.find((type) => type.id === id);
}

export function industryFor(id: BusinessTypeId | string): IndustryFamily | undefined {
  const familyId = familyOf(id);
  return familyId ? INDUSTRIES.find((industry) => industry.id === familyId) : undefined;
}

export function businessTypesForFamily(familyId: IndustryFamilyId): readonly BusinessType[] {
  return BUSINESS_TYPES.filter((type) => type.familyId === familyId);
}

/** The apps a business of this industry may use. Trade keeps every existing app; other industries keep the
 *  shared core (Dashboard, Settings, Contacts, Expenses, Accounting, Reports) plus their own planned modules.
 *  Planned modules are configuration-only: they are catalogued so the launcher can show them, but their
 *  operational ERP modules are not implemented yet. */
export function appsForIndustry(familyId: IndustryFamilyId | undefined): readonly AppId[] {
  const industry = familyId ? INDUSTRIES.find((i) => i.id === familyId) : undefined;
  const core = familyId === "trade" ? EXISTING_TRADE_APP_IDS : sharedRequiredApps;
  if (!industry) return core;
  return [...new Set([...core, ...industry.optionalApps.filter((a) => PLANNED_INDUSTRY_APP_IDS.includes(a as any))])] as readonly AppId[];
}

/** One tile per app for the launcher, in a stable order: shared core first, then the industry's own modules.
 *  `planned` marks a module whose operational ERP is not implemented yet. */
export type IndustryAppTile = { id: AppId; name: string; planned: boolean };
export function industryAppTiles(familyId: IndustryFamilyId | undefined): readonly IndustryAppTile[] {
  const ids = appsForIndustry(familyId);
  const plannedSet = new Set<string>(PLANNED_INDUSTRY_APP_IDS);
  const nameOf = (id: AppId) => INDUSTRY_APP_NAMES[id] ?? id;
  return ids.map((id) => ({ id, name: nameOf(id), planned: plannedSet.has(id) }));
}

/** Display names for the planned industry modules (registry labels only). */
export const INDUSTRY_APP_NAMES: Record<string, string> = {
  frontDesk: "Front Desk",
  production: "Production",
  fleet: "Fleet",
  services: "Services",
  properties: "Properties",
  projects: "Projects",
  students: "Students",
  patients: "Patients",
  pharmacy: "Pharmacy",
  catering: "Catering",
};

/** Glass tint per industry module tile, taken from each module's own colour (Liquid Glass launcher). */
export const INDUSTRY_TILE_TONE: Record<string, string> = {
  frontDesk: "#06b6d4",
  production: "#f59e0b",
  fleet: "#3b82f6",
  services: "#ec4899",
  properties: "#8b5cf6",
  projects: "#f97316",
  students: "#22c55e",
  patients: "#ef4444",
  pharmacy: "#14b8a6",
  catering: "#f43f5e",
};

/** Exact approved-name lookup, case-insensitive for compatibility with older stored labels. */
export function businessTypeByName(name: string): BusinessType | undefined {
  const normalized = name.trim().toLocaleLowerCase();
  return normalized ? BUSINESS_TYPES.find((type) => type.name.toLocaleLowerCase() === normalized) : undefined;
}

/** Industries a new business can choose now. The others show as "Coming soon" until their own apps are built; a business
 *  already saved in one of them keeps working as before. */
export const OPEN_INDUSTRIES: readonly IndustryFamilyId[] = ["trade"];
export const industryIsOpen = (id: string | undefined) => OPEN_INDUSTRIES.includes(id as IndustryFamilyId);
/** What a Trade business that skips the type question is saved as. */
export const GENERAL_TRADE = "General Trade";

export function isIndustryFamilyId(value: unknown): value is IndustryFamilyId {
  return typeof value === "string" && INDUSTRY_FAMILY_IDS.includes(value as IndustryFamilyId);
}

export function validateIndustryCatalogue(): string[] {
  const errors: string[] = [];
  if (INDUSTRIES.length !== 8) errors.push(`Expected 8 industries, got ${INDUSTRIES.length}`);
  if (BUSINESS_TYPES.length !== 111) errors.push(`Expected 111 business types, got ${BUSINESS_TYPES.length}`);
  const ids = new Set(BUSINESS_TYPES.map((type) => type.id));
  if (ids.size !== BUSINESS_TYPES.length) errors.push("Business type ids are not unique");
  for (const industry of INDUSTRIES) {
    const actual = businessTypesForFamily(industry.id).length;
    const expected = EXPECTED_BUSINESS_TYPE_COUNTS[industry.id];
    if (actual !== expected) errors.push(`${industry.name}: expected ${expected}, got ${actual}`);
  }
  return errors;
}
