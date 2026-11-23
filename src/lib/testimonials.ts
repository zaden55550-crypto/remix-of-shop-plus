// Real customer words and shop photos for Log In and Plans (owner, 2026-11-23). Add an entry only with the customer's permission
// and in their own words; the section stays hidden while this list is empty, so nothing made-up is ever shown.
// photo: a file in /public (for example "/customers/mama-njeri.jpg"), optional.
export type Testimonial = { name: string; business: string; town: string; quote: string; photo?: string };

export const TESTIMONIALS: Testimonial[] = [];
