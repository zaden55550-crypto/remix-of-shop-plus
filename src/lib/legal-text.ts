// The Terms & Conditions and Privacy Policy shown at /terms and /privacy (linked from Create Account).
// DRAFT written 2026-11-20 from how the app actually works; it must be reviewed by a qualified lawyer in Kenya before customers
// rely on it. Things only the owner can supply are marked in OWNER_DETAILS: fill them in rather than inventing them.
// The text is English only for now; the page's headings and buttons are translated.

export type LegalSection = { heading: string; paragraphs: string[]; list?: string[] };
export type LegalDoc = { title: string; updated: string; intro: string[]; sections: LegalSection[] };

/** Details only the business behind Zakrio Systems can give. Empty values are left out of the page. */
export const OWNER_DETAILS = {
  legalName: "", // e.g. the registered company name, if different from "Zakrio Systems"
  registrationNumber: "",
  postalAddress: "",
  contactEmail: "",
};

const contactLine = () => {
  const parts = [OWNER_DETAILS.contactEmail && `by email at ${OWNER_DETAILS.contactEmail}`, OWNER_DETAILS.postalAddress && `by post at ${OWNER_DETAILS.postalAddress}`].filter(Boolean);
  return `You can contact us through the Support chat inside the app${parts.length ? `, ${parts.join(", ")}` : ""}.`;
};
const who = () => [OWNER_DETAILS.legalName || "Zakrio Systems", OWNER_DETAILS.registrationNumber && `(registration number ${OWNER_DETAILS.registrationNumber})`].filter(Boolean).join(" ");

export const TERMS: LegalDoc = {
  title: "Terms & Conditions",
  updated: "20 November 2026",
  intro: [
    `These Terms & Conditions ("Terms") are an agreement between you and ${who()} ("Zakrio Systems", "we", "us") for the use of the Zakrio Systems business management software, its apps and its online services (the "Service").`,
    "By creating an account, ticking the box on Create Account or using the Service, you agree to these Terms on behalf of yourself and the business you register. If you do not agree, do not use the Service.",
  ],
  sections: [
    { heading: "1. The Service", paragraphs: [
      "Zakrio Systems helps businesses record sales, purchases, stock, expenses, payments, staff and payroll, and produces reports and accounts from those records. Some features depend on your plan and your industry, and some are marked \"Coming soon\" until they are available.",
      "The Service runs on your device and keeps a copy of your records on our servers so they can sync between your devices and be restored. Some features work offline and send your changes when you are back online.",
    ] },
    { heading: "2. Your account", paragraphs: [
      "You must give true and complete details when you register and keep them up to date. You must be at least 18 years old and able to enter a binding contract for your business.",
      "You are responsible for keeping your password and devices secure and for everything done under your account, including by people you give a login to. Tell us straight away through Support if you think your account has been used without your permission.",
      "You decide who in your business gets a login and what they can do. You are responsible for your employees' use of the Service.",
    ] },
    { heading: "3. Free trial", paragraphs: [
      "A new account starts with a 30-day free trial with Business plan limits. No payment details are needed and billing never starts automatically.",
      "When the trial ends, your records stay available to view and export, but nothing new can be recorded until you subscribe to a plan.",
    ] },
    { heading: "4. Plans, prices and payment", paragraphs: [
      "Each plan has its own price and limits, such as the number of shops and warehouses, logins, managers, staff and counters, as shown on the Plans page when you subscribe.",
      "Prices are shown before you pay and are charged for the billing period you choose (monthly or yearly). Unless the law requires otherwise, payments are not refundable for a period that has started.",
      "If you move to a smaller plan, nothing is deleted. You will not be able to add more than the smaller plan allows until you are within its limits.",
      "We may change prices or plans for future billing periods. We will tell you before a change affects you.",
    ] },
    { heading: "5. Your data", paragraphs: [
      "The business records you enter (products, sales, customers, suppliers, staff, money and documents) belong to you. You give us permission to store, copy, sync and process them only to provide, secure and support the Service.",
      "You can export your records at any time, including after a trial ends or a subscription stops. How we handle personal information is explained in our Privacy Policy.",
      "You are responsible for having the right to enter information about your customers, suppliers and employees, and for using it lawfully, including under the Data Protection Act, 2019.",
    ] },
    { heading: "6. Acceptable use", paragraphs: ["You must not:"], list: [
      "use the Service for anything unlawful, fraudulent or to evade tax;",
      "try to access accounts, businesses or data that are not yours;",
      "interfere with, overload, copy, resell or reverse engineer the Service, except where the law allows;",
      "upload harmful code, or content you have no right to use.",
    ] },
    { heading: "7. Accuracy and professional advice", paragraphs: [
      "The Service calculates figures such as stock, profit, tax and payroll from the records you enter. You are responsible for checking them before relying on them, for example in tax returns or payments to staff. The Service is not legal, tax or accounting advice.",
      "Suggestions from ShopBot and other AI features are generated automatically, may be wrong and never change your records by themselves. Check them before acting on them.",
    ] },
    { heading: "8. Availability and changes", paragraphs: [
      "We work to keep the Service available and your data safe, but we cannot promise that it will always be available, uninterrupted or error-free. Keep your devices updated and export important records regularly.",
      "We may improve or change the Service. If a change removes something important you pay for, we will tell you in advance.",
    ] },
    { heading: "9. Suspension and ending", paragraphs: [
      "You may stop using the Service at any time. You can export your records before you go.",
      "We may suspend or close an account that breaks these Terms or puts other users or the Service at risk. Where reasonable, we will tell you first and give you a chance to export your records.",
    ] },
    { heading: "10. Liability", paragraphs: [
      "To the extent the law allows, we are not liable for indirect or consequential loss, such as lost profits, lost data you did not export, or business interruption. Our total liability to you for any claim is limited to the amount you paid us for the Service in the 12 months before the claim.",
      "Nothing in these Terms limits any right you have under the Consumer Protection Act, 2012 or any other law that cannot be excluded.",
    ] },
    { heading: "11. Changes to these Terms", paragraphs: [
      "We may update these Terms. The date at the top shows the latest version. We will tell you about important changes in the app before they take effect. Continuing to use the Service after that means you accept the new Terms.",
    ] },
    { heading: "12. Law and disputes", paragraphs: [
      "These Terms are governed by the laws of Kenya. We will first try to resolve any dispute with you in good faith through Support. If that fails, the courts of Kenya will decide it.",
    ] },
    { heading: "13. Contact", paragraphs: [contactLine()] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  updated: "20 November 2026",
  intro: [
    `This Privacy Policy explains how ${who()} ("Zakrio Systems", "we", "us") collects, uses and protects personal information when you use the Zakrio Systems software and online services (the "Service"), in line with the Data Protection Act, 2019 of Kenya.`,
  ],
  sections: [
    { heading: "1. Our two roles", paragraphs: [
      "For your own account (the business owner's details, sign-in and subscription), we decide how the information is used, so we are the data controller.",
      "For the records your business enters about other people (customers, suppliers and employees), your business decides why and how they are used, so your business is the data controller and we process them on its behalf only to provide the Service. If one of those people asks us about their information, we will refer them to your business.",
    ] },
    { heading: "2. Information we collect", paragraphs: [], list: [
      "Account details: business name, your name, email address, phone numbers, country, currency, logo, tax PIN and addresses you enter.",
      "Sign-in details: your password (stored on your device only as a protected hash and, for your online account, by our sign-in provider; we never see it in plain text) and, if you choose, your Google or Apple sign-in.",
      "Business records: products, stock, sales, purchases, expenses, payments, customers, suppliers, employees, payroll and documents you create in the Service.",
      "Staff logins: names, email addresses, phone numbers, roles, permissions and the shops, warehouses and counters each person may use.",
      "Technical information: device and browser type, app version, sync and error logs, and sign-in times, used to keep the Service working and secure.",
      "Support messages you send us.",
    ] },
    { heading: "3. How we use it", paragraphs: [], list: [
      "to create and run your account and provide every feature of the Service, including syncing your records between your devices and restoring them;",
      "to send login invitations by email or SMS to people you add, and to send account and security messages;",
      "to answer ShopBot and AI requests you make, using only the records needed for the answer;",
      "to keep the Service secure, prevent fraud and misuse, and fix problems;",
      "to manage your trial, plan and payments;",
      "to meet legal obligations, such as keeping financial records where the law requires.",
    ] },
    { heading: "4. Legal basis", paragraphs: [
      "We process personal information to perform our contract with you, to comply with the law, for our legitimate interest in running a secure and reliable Service, and with your consent where the law requires it (you can withdraw consent at any time).",
    ] },
    { heading: "5. Who we share it with", paragraphs: [
      "We do not sell personal information. We share it only with service providers who help us run the Service, under contracts that require them to protect it and use it only for us:",
    ], list: [
      "cloud hosting and database providers that store and sync your records;",
      "sign-in providers, including Google and Apple if you choose them;",
      "email and SMS providers that deliver invitations and account messages;",
      "the AI provider that answers ShopBot and AI requests;",
      "payment providers, once paid plans are charged online.",
    ] },
    { heading: "6. Transfers outside Kenya", paragraphs: [
      "Some of these providers may store or process information outside Kenya. When that happens, we use providers that give appropriate safeguards for personal information, as the Data Protection Act, 2019 requires.",
    ] },
    { heading: "7. How long we keep it", paragraphs: [
      "We keep your account and business records while your account is open, and after a trial or subscription ends so you can still view and export them. When you ask us to close your account, we delete or anonymise the records within a reasonable time, unless the law requires us to keep some of them (for example, financial records).",
    ] },
    { heading: "8. Security", paragraphs: [
      "We protect information with access controls, encrypted connections, passwords stored only as protected hashes, separate permissions for each login, and audit logs that record who changed what. No system is completely secure; keep your password private and your devices locked.",
    ] },
    { heading: "9. Your rights", paragraphs: ["Under the Data Protection Act, 2019 you have the right to:"], list: [
      "be told how your personal information is used;",
      "get a copy of your personal information;",
      "have wrong or incomplete information corrected;",
      "have information deleted where there is no reason to keep it;",
      "object to or restrict some uses of your information;",
      "receive your information in a portable format (you can export your records from the app at any time).",
    ] },
    { heading: "10. Making a request or a complaint", paragraphs: [
      `To use any of these rights, ${contactLine().charAt(0).toLowerCase()}${contactLine().slice(1)} We may need to confirm your identity first.`,
      "If you are not satisfied with our answer, you may complain to the Office of the Data Protection Commissioner (ODPC) of Kenya.",
    ] },
    { heading: "11. Children", paragraphs: [
      "The Service is for businesses and is not meant for anyone under 18. We do not knowingly collect information from children.",
    ] },
    { heading: "12. Changes to this policy", paragraphs: [
      "We may update this Privacy Policy. The date at the top shows the latest version, and we will tell you about important changes in the app.",
    ] },
  ],
};
