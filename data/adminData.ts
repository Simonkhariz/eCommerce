export type PriorityType = 'High' | 'Medium' | 'Low';
export type StatusType = 'In Review' | 'In Progress' | 'Delivered';
export type PeriodKey = 'last-week' | 'last-month' | 'last-quarter';

export interface Ticket {
  id: string;
  subject: string;
  priority: PriorityType;
  assignee: string;
  assigneeAvatar?: string;
  status: StatusType;
  created: string;
  slaHours: number;
}

export interface MetricCardDef {
  key: 'tickets' | 'resolution' | 'sla';
  title: string;
  icon: string;
  patternLeft: string;
  tracking?: string;
}

export interface MetricData {
  value: number;
  delta: number;
  suffix?: string;
}

export interface PeriodMetrics {
  tickets: MetricData;
  resolution: MetricData;
  sla: MetricData;
}

export interface TrendBar {
  label: string;
  height: number;
}

export interface TrendPeriodData {
  total: number;
  delta: number;
  active: number;
  bars: TrendBar[];
}

export interface ActivityItem {
  id: string;
  kind: 'ticket' | 'user' | 'repeat' | 'alert' | 'book' | 'star';
  title: string;
  time: string;
  body: string | { text: string; strong?: string }[];
  wrap?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  children?: { id: string; label: string }[];
}

export const PERIOD_OPTIONS: { value: PeriodKey; label: string; compare: string }[] = [
  { value: 'last-week', label: 'Last week', compare: 'vs last week' },
  { value: 'last-month', label: 'Last month', compare: 'vs last month' },
  { value: 'last-quarter', label: 'Last quarter', compare: 'vs last quarter' },
];

export const METRIC_DEFS: MetricCardDef[] = [
  { key: 'tickets', title: 'Current Tickets', icon: 'ticket', patternLeft: 'calc(50% - 55.17px)' },
  {
    key: 'resolution',
    title: 'Daily Avg. Resolution',
    icon: 'zap',
    patternLeft: 'calc(50% - 54.83px)',
    tracking: 'tracking-[-0.14px]',
  },
  { key: 'sla', title: 'SLA Compliance Rate', icon: 'timer', patternLeft: 'calc(50% - 55.5px)' },
];

export const METRICS_BY_PERIOD: Record<PeriodKey, PeriodMetrics> = {
  'last-week': {
    tickets: { value: 3484, delta: 7.1 },
    resolution: { value: 486, delta: 2.0 },
    sla: { value: 92, suffix: '%', delta: -1.3 },
  },
  'last-month': {
    tickets: { value: 14921, delta: 4.6 },
    resolution: { value: 471, delta: -0.8 },
    sla: { value: 94, suffix: '%', delta: 1.9 },
  },
  'last-quarter': {
    tickets: { value: 43207, delta: 12.4 },
    resolution: { value: 455, delta: 3.2 },
    sla: { value: 91, suffix: '%', delta: -2.1 },
  },
};

const CHART_DAYS = [
  'Sat',
  'Sun',
  'Mon',
  'Mon',
  'Tue',
  'Tue',
  'Wed',
  'Wed',
  'Thu',
  'Thu',
  'Fri',
  'Fri',
  'Sat',
  'Sat',
  'Sun',
];

const buildBars = (heights: number[]): TrendBar[] =>
  heights.map((h, i) => ({ label: CHART_DAYS[i], height: h }));

export const TREND_DATA_BY_PERIOD: Record<PeriodKey, TrendPeriodData> = {
  'last-week': {
    total: 4790,
    delta: 8,
    active: 5,
    bars: buildBars([68, 139, 161, 95, 128, 139, 110, 139, 182, 161, 149, 161, 84, 170, 125]),
  },
  'last-month': {
    total: 19640,
    delta: 5,
    active: 8,
    bars: buildBars([92, 118, 150, 131, 104, 163, 142, 120, 176, 158, 133, 170, 112, 146, 101]),
  },
  'last-quarter': {
    total: 58312,
    delta: 11,
    active: 11,
    bars: buildBars([80, 97, 124, 142, 118, 131, 156, 149, 168, 143, 177, 190, 139, 162, 121]),
  },
};

export const ACTIVITY_TABS = [
  { value: 'today', label: 'Today', caption: 'new activities today' },
  { value: 'yesterday', label: 'Yesterday', caption: 'activities yesterday' },
  { value: 'week', label: 'This week', caption: 'highlights this week' },
];

export const UPDATES_FEED_DATA: Record<string, ActivityItem[]> = {
  today: [
    {
      id: 'a1',
      kind: 'ticket',
      title: 'Ticket Created',
      time: '11:42 AM',
      body: [
        { text: 'Ticket ' },
        { text: '#2322', strong: '#2322' },
        { text: ' opened by ' },
        { text: 'Michael Wong', strong: 'Michael Wong' },
      ],
    },
    {
      id: 'a2',
      kind: 'user',
      title: 'Agent Assigned',
      time: '11:20 AM',
      body: [
        { text: 'Ticket ' },
        { text: '#2321', strong: '#2321' },
        { text: ' assigned to ' },
        { text: 'John Doe', strong: 'John Doe' },
      ],
    },
    {
      id: 'a3',
      kind: 'alert',
      title: 'SLA Warning',
      time: '11:05 AM',
      body: [
        { text: 'Ticket ' },
        { text: '#2319', strong: '#2319' },
        { text: ' expires in ' },
        { text: '2 hours', strong: '2 hours' },
      ],
    },
    {
      id: 'a4',
      kind: 'repeat',
      title: 'Status Changed',
      time: '10:48 AM',
      body: [
        { text: 'Ticket ' },
        { text: '#2320', strong: '#2320' },
        { text: ' moved to ' },
        { text: 'Delivered', strong: 'Delivered' },
      ],
    },
    {
      id: 'a5',
      kind: 'book',
      title: 'Knowledge Base',
      time: '10:30 AM',
      body: [
        { text: 'New article published: "' },
        { text: 'Login Troubleshooting', strong: 'Login Troubleshooting' },
        { text: '"' },
      ],
      wrap: true,
    },
    {
      id: 'a6',
      kind: 'star',
      title: 'Customer Feedback',
      time: '10:30 AM',
      body: [
        { text: '"' },
        {
          text: 'Great support response, thanks Sarah!',
          strong: 'Great support response, thanks Sarah!',
        },
        { text: '"' },
      ],
      wrap: true,
    },
    {
      id: 'a7',
      kind: 'ticket',
      title: 'Ticket Closed',
      time: '09:58 AM',
      body: [
        { text: 'Ticket ' },
        { text: '#2311', strong: '#2311' },
        { text: ' resolved by ' },
        { text: 'Sarah Lee', strong: 'Sarah Lee' },
      ],
    },
    {
      id: 'a8',
      kind: 'user',
      title: 'Agent Online',
      time: '09:02 AM',
      body: [{ text: 'John Doe', strong: 'John Doe' }, { text: ' started a shift' }],
    },
  ],
  yesterday: [
    {
      id: 'b1',
      kind: 'alert',
      title: 'SLA Breached',
      time: '05:40 PM',
      body: [
        { text: 'Ticket ' },
        { text: '#2298', strong: '#2298' },
        { text: ' missed first response' },
      ],
    },
    {
      id: 'b2',
      kind: 'repeat',
      title: 'Agent Reassigned',
      time: '03:12 PM',
      body: [
        { text: 'Ticket ' },
        { text: '#2301', strong: '#2301' },
        { text: ' moved to ' },
        { text: 'Sarah Lee', strong: 'Sarah Lee' },
      ],
    },
    {
      id: 'b3',
      kind: 'star',
      title: 'Customer Feedback',
      time: '01:26 PM',
      body: [
        { text: '"' },
        { text: 'Fast fix on the billing bug', strong: 'Fast fix on the billing bug' },
        { text: '"' },
      ],
      wrap: true,
    },
    {
      id: 'b4',
      kind: 'ticket',
      title: 'Ticket Updated',
      time: '11:05 AM',
      body: [
        { text: 'Ticket ' },
        { text: '#2305', strong: '#2305' },
        { text: ' priority raised' },
      ],
    },
    {
      id: 'b5',
      kind: 'book',
      title: 'Knowledge Base',
      time: '09:30 AM',
      body: [
        { text: 'Article updated: "' },
        { text: 'Invoice Exports', strong: 'Invoice Exports' },
        { text: '"' },
      ],
      wrap: true,
    },
  ],
  week: [
    {
      id: 'c1',
      kind: 'user',
      title: 'New Client Added',
      time: 'Mon',
      body: [{ text: 'PT. Nusantara Retail registered' }],
    },
    {
      id: 'c2',
      kind: 'alert',
      title: 'SLA Breach Risk',
      time: 'Mon',
      body: [
        { text: '3 tickets near ' },
        { text: 'response SLA', strong: 'response SLA' },
      ],
    },
    {
      id: 'c3',
      kind: 'ticket',
      title: 'Bulk Update',
      time: 'Tue',
      body: [
        { text: '42', strong: '42' },
        { text: ' tickets tagged ' },
        { text: 'billing', strong: 'billing' },
      ],
    },
    {
      id: 'c4',
      kind: 'repeat',
      title: 'Queue Rebalanced',
      time: 'Wed',
      body: [{ text: 'Workload shifted to ' }, { text: 'Tier 2', strong: 'Tier 2' }],
    },
    {
      id: 'c5',
      kind: 'book',
      title: 'Knowledge Base',
      time: 'Thu',
      body: [
        { text: 'New article published: "' },
        { text: 'SSO Setup Guide', strong: 'SSO Setup Guide' },
        { text: '"' },
      ],
      wrap: true,
    },
    {
      id: 'c6',
      kind: 'star',
      title: 'CSAT Milestone',
      time: 'Fri',
      body: [{ text: 'CSAT reached ' }, { text: '4.8 / 5', strong: '4.8 / 5' }],
    },
  ],
};

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: '#2319',
    subject: 'Payment failed on invoice',
    priority: 'High',
    assignee: 'John Doe',
    assigneeAvatar: '/admin/avatar-john.jpg',
    status: 'In Review',
    created: '2025-08-18',
    slaHours: 2,
  },
  {
    id: '#2320',
    subject: 'Login issue',
    priority: 'Medium',
    assignee: 'Sarah Lee',
    assigneeAvatar: '/admin/avatar-sarah.jpg',
    status: 'Delivered',
    created: '2025-08-19',
    slaHours: 1,
  },
  {
    id: '#2321',
    subject: 'Feature request export',
    priority: 'Low',
    assignee: 'John Doe',
    assigneeAvatar: '/admin/avatar-john.jpg',
    status: 'In Progress',
    created: '2025-08-19',
    slaHours: 24,
  },
  {
    id: '#2322',
    subject: 'Contract renewal issue',
    priority: 'Medium',
    assignee: 'Michael Wong',
    assigneeAvatar: '/admin/avatar-michael.jpg',
    status: 'In Progress',
    created: '2025-08-20',
    slaHours: 9,
  },
  {
    id: '#2323',
    subject: 'Webhook callback signature failure',
    priority: 'High',
    assignee: 'Sarah Lee',
    assigneeAvatar: '/admin/avatar-sarah.jpg',
    status: 'In Review',
    created: '2025-08-20',
    slaHours: 4,
  },
  {
    id: '#2324',
    subject: 'Custom domain SSL certificate renewal',
    priority: 'Low',
    assignee: 'Michael Wong',
    assigneeAvatar: '/admin/avatar-michael.jpg',
    status: 'Delivered',
    created: '2025-08-21',
    slaHours: 48,
  },
  {
    id: '#2325',
    subject: 'Stripe 3DS authentication timeout',
    priority: 'High',
    assignee: 'John Doe',
    assigneeAvatar: '/admin/avatar-john.jpg',
    status: 'In Progress',
    created: '2025-08-21',
    slaHours: 3,
  },
];

export const OPERATIONS_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'sb-dashboard' },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'sb-ticket',
    children: [
      { id: 'orders', label: 'All Orders' },
      { id: 'shipping', label: 'Shipping & Fulfilment' },
    ],
  },
  {
    id: 'products',
    label: 'Catalog & Stock',
    icon: 'sb-file',
    children: [
      { id: 'products', label: 'Products & SKUs' },
      { id: 'categories', label: 'Categories' },
      { id: 'inventory', label: 'Inventory & Logs' },
    ],
  },
  { id: 'customers', label: 'Customers', icon: 'user-account' },
  {
    id: 'payments',
    label: 'Finances & Refunds',
    icon: 'zap',
    children: [
      { id: 'payments', label: 'Transactions' },
      { id: 'refunds', label: 'Refund Claims' },
    ],
  },
];

export const GROWTH_NAV_ITEMS: NavItem[] = [
  {
    id: 'promotions',
    label: 'Marketing & Promos',
    icon: 'target',
    children: [
      { id: 'promotions', label: 'Coupons & Discounts' },
      { id: 'marketing', label: 'Email Marketing' },
      { id: 'storefront', label: 'Banners & Reviews' },
    ],
  },
  { id: 'analytics', label: 'Analytics & Reports', icon: 'analytics' },
];

export const SYSTEM_NAV_ITEMS: NavItem[] = [
  { id: 'notifications', label: 'Email Outbox', icon: 'bell' },
  { id: 'audit-logs', label: 'Audit Logs', icon: 'clock-01' },
  { id: 'settings', label: 'Store Settings', icon: 'sb-settings' },
  { id: 'system-status', label: 'System Diagnostics', icon: 'headset' },
  { id: 'account', label: 'Admin Profile', icon: 'user-group' },
];

export const COMMERCE_NAV_ITEMS: NavItem[] = [];

// Backwards-compatible aliases
export const MAIN_NAV_ITEMS = OPERATIONS_NAV_ITEMS;
export const ANALYTICS_NAV_ITEMS = GROWTH_NAV_ITEMS;
export const SECONDARY_NAV_ITEMS = SYSTEM_NAV_ITEMS;

export const PRIORITY_ICON_MAP: Record<PriorityType, string> = {
  High: 'signal-full',
  Medium: 'signal-medium',
  Low: 'signal-low',
};

export const STATUS_ICON_MAP: Record<StatusType, string> = {
  'In Review': 'status-review',
  'In Progress': 'status-progress',
  Delivered: 'status-delivered',
};

export const ASSIGNEE_AVATAR_MAP: Record<string, string> = {
  'John Doe': '/admin/avatar-john.jpg',
  'Sarah Lee': '/admin/avatar-sarah.jpg',
  'Michael Wong': '/admin/avatar-michael.jpg',
};
