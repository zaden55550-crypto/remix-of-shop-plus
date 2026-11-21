// What each approved business type needs to operate: the implemented apps it reuses and the industry modules it requires.
// One entry per business type (all 111, by their approved names in industry-config.ts), never one list per industry, so a
// laundry, a salon and a repair shop each get their own workflows. Modules marked planned are catalogued requirements only:
// they show on the launcher as coming soon and never open until they are built.
//
// Implemented apps are the 13 existing ones. The shared business apps (Dashboard, Contacts, Expenses, Float, Accounting, Payroll,
// Reports, Summary, Settings) are reused by every business. Inventory and Purchases are reused only where the type holds stock
// (ingredients, parts, raw materials, medical supplies). Sales and POS are Trade's retail counter; other types get their own billing
// and order modules instead.

/** The 13 implemented apps. */
export const IMPLEMENTED_APPS = ["dashboard", "inventory", "purchases", "sales", "pos", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary", "settings"] as const;
export type ImplementedApp = (typeof IMPLEMENTED_APPS)[number];

/** Industry modules that are required but not built yet. `privacy`: holds personal or clinical records that need restricted access when built. */
export const MODULES = {
  orders: { name: "Order Management" },
  garments: { name: "Garment Processing" },
  appointments: { name: "Appointments" },
  serviceMenu: { name: "Services & Pricing" },
  commissions: { name: "Staff Commissions" },
  clientProfiles: { name: "Client Profiles", privacy: true },
  jobCards: { name: "Job Cards" },
  diagnostics: { name: "Diagnostics" },
  technicians: { name: "Technician Workflow" },
  scheduling: { name: "Job Scheduling" },
  rentals: { name: "Rental Bookings" },
  timesheets: { name: "Timesheets" },
  projects: { name: "Projects" },
  reservations: { name: "Reservations" },
  rooms: { name: "Rooms" },
  housekeeping: { name: "Housekeeping" },
  guestBilling: { name: "Guest Billing" },
  frontDesk: { name: "Front Desk" },
  menu: { name: "Menu" },
  tables: { name: "Tables" },
  kitchen: { name: "Kitchen Orders" },
  restaurantPos: { name: "Restaurant POS" },
  catering: { name: "Catering" },
  events: { name: "Event Bookings" },
  production: { name: "Production" },
  bom: { name: "Bill of Materials" },
  workOrders: { name: "Work Orders" },
  costing: { name: "Production Costing" },
  quality: { name: "Quality Control" },
  batches: { name: "Batch & Expiry Tracking" },
  patients: { name: "Patients", privacy: true },
  clinical: { name: "Clinical Records", privacy: true },
  patientBilling: { name: "Patient Billing", privacy: true },
  labResults: { name: "Lab & Test Results", privacy: true },
  imaging: { name: "Imaging Studies", privacy: true },
  students: { name: "Students", privacy: true },
  academics: { name: "Academics & Classes" },
  fees: { name: "Fee Management" },
  attendance: { name: "Attendance" },
  courses: { name: "Courses" },
  properties: { name: "Properties" },
  listings: { name: "Property Listings" },
  tenants: { name: "Tenants & Leases", privacy: true },
  rentCollection: { name: "Rent Collection" },
  maintenance: { name: "Maintenance Requests" },
  salesPipeline: { name: "Sales Pipeline" },
  estimates: { name: "Estimates & BOQ" },
  sites: { name: "Site Management" },
  subcontractors: { name: "Subcontractors" },
  fleet: { name: "Fleet" },
  trips: { name: "Trips & Dispatch" },
  shipments: { name: "Shipments" },
  deliveries: { name: "Deliveries" },
  storage: { name: "Storage Contracts" },
} as const satisfies Record<string, { name: string; privacy?: boolean }>;
export type ModuleId = keyof typeof MODULES;

export type TypeRequirement = { apps: readonly ImplementedApp[]; modules: readonly ModuleId[] };

const SHARED: readonly ImplementedApp[] = ["dashboard", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary", "settings"];
const TRADE: readonly ImplementedApp[] = IMPLEMENTED_APPS;
const STOCK: readonly ImplementedApp[] = ["inventory", "purchases"];
const req = (modules: readonly ModuleId[], stock = false): TypeRequirement => ({ apps: stock ? [...SHARED, ...STOCK] : SHARED, modules });
const trade: TypeRequirement = { apps: TRADE, modules: [] };

const hotel = req(["reservations", "rooms", "housekeeping", "guestBilling", "frontDesk"], true);
const restaurant = req(["menu", "tables", "kitchen", "restaurantPos"], true);
const venue = req(["events", "reservations", "guestBilling"]);
const factory = (extra: readonly ModuleId[] = []) => req(["production", "bom", "workOrders", "costing", "quality", ...extra], true);
const clinic = (extra: readonly ModuleId[] = []) => req(["patients", "appointments", "clinical", "patientBilling", ...extra], true);
const school = (extra: readonly ModuleId[] = []) => req(["students", "academics", "fees", "attendance", ...extra]);
const agency = req(["listings", "salesPipeline", "properties"]);
const manager = req(["properties", "tenants", "rentCollection", "maintenance"]);
const builder = req(["projects", "estimates", "sites", "subcontractors"], true);
const engineer = req(["projects", "estimates", "timesheets"]);
const haulier = (extra: readonly ModuleId[] = []) => req(["fleet", "trips", ...extra]);

/** Every approved business type, by its exact approved name. */
export const TYPE_REQUIREMENTS: Readonly<Record<string, TypeRequirement>> = {
  // Trade: every existing app, as before.
  "Retail Shop": trade, "Supermarket": trade, "Wholesale Business": trade, "Electronics Shop": trade, "Clothing & Fashion Shop": trade,
  "Grocery Store": trade, "Hardware Shop": trade, "Cosmetics & Beauty Shop": trade, "Furniture Shop": trade, "Pharmacy": trade,
  "Jewellery Shop": trade, "General Merchandise Store": trade, "Building Materials Shop": trade, "Automotive Parts Shop": trade, "Stationery & Bookshop": trade,
  "Agrovet": trade, "Butchery": trade, "Wines & Spirits": trade, "Mobile Phones & Accessories": trade, "Shoe Shop": trade,
  "Mitumba (Second-hand Clothes)": trade, "Gas / LPG Dealer": trade, "Cereals & Grains Shop": trade, "Mini-mart / Kiosk": trade, "General Trade": trade,
  // Manufacturing: production, BOM, work orders and costing, with raw-material stock.
  "Food & Beverage Manufacturing": factory(["batches"]), "Textile & Garment Manufacturing": factory(), "Furniture Manufacturing": factory(["orders"]),
  "Pharmaceutical Manufacturing": factory(["batches"]), "Packaging Manufacturing": factory(), "Printing & Publishing": factory(["orders", "jobCards"]),
  "Plastic & Rubber Manufacturing": factory(), "Metal Fabrication": factory(["orders", "jobCards"]), "Chemical Manufacturing": factory(["batches"]),
  "Electronics Manufacturing": factory(), "Building Materials Manufacturing": factory(), "General Manufacturing": factory(),
  // Hospitality: rooms and guests, or menus, tables and the kitchen.
  "Hotel": hotel, "Resort": req(["reservations", "rooms", "housekeeping", "guestBilling", "frontDesk", "events"], true), "Lodge": hotel, "Guesthouse": hotel,
  "Serviced Apartments": req(["reservations", "rooms", "housekeeping", "guestBilling"]), "Boutique Hotel": hotel,
  "Restaurant": restaurant, "Café": restaurant, "Catering Business": req(["catering", "menu", "events", "orders"], true), "Bar & Lounge": req(["menu", "tables", "restaurantPos"], true),
  "Fast-Food Business": req(["menu", "kitchen", "restaurantPos", "orders"], true), "Event Venue": venue, "Banquet & Conference Facility": req(["events", "reservations", "guestBilling", "catering"]),
  // Services: each its own workflow.
  "Laundry & Dry Cleaning": req(["orders", "garments", "deliveries"]),
  "Salon & Beauty": req(["appointments", "serviceMenu", "commissions", "clientProfiles"], true),
  "Barber Shop": req(["appointments", "serviceMenu", "commissions", "clientProfiles"]),
  "Spa & Wellness": req(["appointments", "serviceMenu", "commissions", "clientProfiles"], true),
  "Repair & Maintenance Services": req(["jobCards", "diagnostics", "technicians"], true),
  "Cleaning Services": req(["scheduling", "orders"], true),
  "Equipment Rental": req(["rentals", "maintenance"], true),
  "Vehicle Rental": req(["rentals", "fleet", "maintenance"]),
  "Professional Services": req(["projects", "timesheets"]),
  "Photography & Media Services": req(["appointments", "projects", "orders"]),
  "Printing Services": req(["orders", "jobCards"], true),
  "Consultancy Services": req(["projects", "timesheets"]),
  // Property & construction: selling, managing and building.
  "Real Estate Agency": agency, "Property Brokerage": agency, "Residential Property Sales": agency, "Commercial Property Sales": agency, "Land Sales": agency,
  "Residential Property Management": manager, "Commercial Property Management": manager, "Apartment & Estate Management": manager,
  "Residential Rentals": manager, "Commercial Rentals": manager, "Short-Term Rentals": req(["properties", "reservations", "housekeeping", "guestBilling"]),
  "Property Development": req(["projects", "estimates", "sites", "salesPipeline", "properties"], true),
  "Building Contractor": builder, "Civil Construction": builder, "Road Construction": builder, "Infrastructure Construction": builder, "Renovation & Refurbishment": builder,
  "Civil Engineering": engineer, "Mechanical Engineering": engineer, "Electrical Engineering": engineer, "Engineering Consultancy": engineer,
  "Facilities Engineering": req(["maintenance", "jobCards", "technicians", "scheduling"], true),
  // Logistics: vehicles, trips and what they carry.
  "Transport Company": haulier(), "Logistics Company": haulier(["shipments", "deliveries"]), "Distribution Business": { apps: TRADE.filter((a) => a !== "pos"), modules: ["fleet", "deliveries"] },
  "Courier & Delivery Services": haulier(["deliveries"]), "Freight Forwarding": req(["shipments"]), "Cargo Handling": req(["shipments", "storage"], true),
  "Fleet Management Business": haulier(["maintenance"]), "Warehousing & Storage": req(["storage", "deliveries"], true), "Moving & Relocation Services": haulier(["orders"]),
  // Education: students, academics and fees.
  "Primary School": school(), "Secondary School": school(), "College": school(["courses"]), "University": school(["courses"]),
  "Technical & Vocational Institution": school(["courses"]), "Training Centre": req(["students", "courses", "fees"]),
  "Early Childhood Education Centre": school(), "Online Learning Institution": req(["students", "courses", "fees"]), "Professional Training Institution": req(["students", "courses", "fees"]),
  // Healthcare: patient and clinical workflows with restricted records.
  "Medical Clinic": clinic(), "Hospital": clinic(["labResults", "imaging"]), "Dental Clinic": clinic(), "Medical Laboratory": clinic(["labResults"]),
  "Diagnostic Centre": clinic(["labResults", "imaging"]), "Specialist Medical Centre": clinic(), "Physiotherapy Centre": clinic(),
  "Medical Imaging Centre": clinic(["imaging"]), "Outpatient Centre": clinic(),
};

/** A type's requirements, or undefined for a name that isn't an approved type. */
export const requirementsOf = (businessType: string | undefined) => (businessType ? TYPE_REQUIREMENTS[businessType] : undefined);
