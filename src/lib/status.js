// Project status badges (front matter `status:`).
export const STATUSES = {
  active: { label: 'Active', icon: 'rocket_launch', tone: 'tip' },
  maintained: { label: 'Maintained', icon: 'build', tone: 'note' },
  experimental: { label: 'Experimental', icon: 'science', tone: 'important' },
  paused: { label: 'Paused', icon: 'pause_circle', tone: 'warning' },
  finished: { label: 'Finished', icon: 'task_alt', tone: 'note' },
  archived: { label: 'Archived', icon: 'inventory_2', tone: 'neutral' },
};
export const STATUS_NAMES = Object.keys(STATUSES);
