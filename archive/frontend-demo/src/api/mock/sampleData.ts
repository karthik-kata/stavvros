import type { Person } from '../../types';
import type { Extras, PeopleDirectory } from '../../lib/driftBuilder';

/**
 * Sample data the engine does not produce yet: people, commit history and AI usage.
 * Everything here is invented for the demo and is labelled as sample data in the UI.
 */

export const DEMO_NOW = '2026-10-30T13:10:00-04:00';

export const CURRENT_USER: Person = { name: 'Alex', team: 'Checkout Team', role: 'Tech lead' };

const DOC_OWNERS: Record<string, Person> = {
  checkout: { name: 'David', team: 'Checkout Team', role: 'Product manager' },
  payments: { name: 'Priya', team: 'Payments Platform Team', role: 'Staff engineer' },
};
const CODE_OWNERS: Record<string, Person> = {
  checkout: CURRENT_USER,
  payments: { name: 'Priya', team: 'Payments Platform Team', role: 'Staff engineer' },
};
const key = (team: string) => (/checkout/i.test(team) ? 'checkout' : /payment/i.test(team) ? 'payments' : '');
const fallback = (team: string): Person => ({ name: team.replace(/\s*\(.*\)/, ''), team: team.replace(/\s*\(.*\)/, '') });

export const PEOPLE: PeopleDirectory = {
  docOwner: (team) => DOC_OWNERS[key(team)] ?? fallback(team),
  codeOwner: (team) => CODE_OWNERS[key(team)] ?? fallback(team),
};

export function EXTRAS(alertId: string): Extras {
  if (alertId.startsWith('alert-ver-contract-PRD-2025-Refund-Policy'))
    return {
      diverged: { commit: 'a91f3c', message: 'Migrate refunds to async v2', author: 'Priya (Payments)', date: '2026-09-12T15:20:00-04:00' },
      ai_answers_7d: 14,
    };
  if (alertId.startsWith('alert-ver-contract-Architecture-Payments'))
    return { ai_answers_7d: 3, detected_at: '2026-10-21T10:02:00-04:00' };
  if (alertId.startsWith('alert-phantom'))
    return { ai_answers_7d: 3, detected_at: '2026-10-21T10:02:00-04:00' };
  if (alertId.includes('checkout_cart'))
    return { ai_answers_7d: 0, detected_at: '2026-10-02T09:40:00-04:00' };
  return { ai_answers_7d: 1, detected_at: '2026-10-02T09:40:00-04:00' };
}
