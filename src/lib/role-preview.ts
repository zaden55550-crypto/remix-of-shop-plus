// What each role can usually open, shown when adding a person (owner, 2026-11-22, like Zoho's role preview). Plain words for the
// starting templates; the exact switches are the role templates on the server and can be changed in Manage Access.
export const ROLE_PREVIEW: Record<string, { can: string[]; cannot: string[] }> = {
  admin: { can: ["Every app and every location", "People, access and settings"], cannot: ["Ownership and the subscription"] },
  manager: { can: ["POS, Sales, Inventory and Purchases at their locations", "Customers, suppliers and reports", "Approves returns and discounts"], cannot: ["Business settings and the subscription"] },
  shopkeeper: { can: ["POS and Sales at their shop", "Customers", "Their own cash-up"], cannot: ["Buying prices, purchases and other shops"] },
  warehouse_staff: { can: ["Inventory at their warehouse", "Stock in, stock out and transfers"], cannot: ["Selling, money and other locations"] },
  staff: { can: ["Only what you switch on in Manage Access"], cannot: ["Everything else until you allow it"] },
};
export const rolePreview = (role: string) => ROLE_PREVIEW[role];
