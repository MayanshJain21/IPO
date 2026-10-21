// Offline pipeline entry point. Runs on your laptop, never on the deployed server.
// Later commits add: scrape (#3), download (#4), process:new (#6), extract (#8), flags (#10), index (#12).
import { FILING_STATUSES } from '@ipo/shared';

console.log('pipeline ready, filing lifecycle:', FILING_STATUSES.join(' -> '));
