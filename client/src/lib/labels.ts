import type { DocumentType, IssueStatus } from '@ipo/shared';

export const STATUS_STYLE: Record<IssueStatus, string> = {
  open: 'bg-green-50 text-green-700 ring-green-600/20',
  upcoming: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  closed: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  listed: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  withdrawn: 'bg-red-50 text-red-700 ring-red-600/20',
};

export const DOC_LABEL: Record<DocumentType, string> = {
  drhp: 'DRHP',
  rhp: 'RHP',
  prospectus: 'Prospectus',
  addendum: 'Addendum',
  mar: 'MAR',
  results: 'Results',
};
