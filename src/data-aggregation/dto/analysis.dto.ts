export type TimeRange = '7d' | '30d' | '90d' | '1y';

export interface AggregatedData {
  totalEvents: number;
  uniquePages: number;
  totalTimeOnPage: number;
  avgTimeOnPage: number;
  totalClicks: number;
  totalScrolls: number;
  totalHovers: number;
  clickRate: number;
  scrollDepth: number;
  frictionPoints: FrictionPoint[];
  userJourney: UserJourneyStep[];
  events: any[]; // BehaviorEvent[]
  analyzedAt: Date;
}

export interface FrictionPoint {
  type: 'CLICK_MISSED' | 'SCROLL_HESITATION' | 'EXCESSIVE_TIME_ON_PAGE';
  timestamp: Date;
  pageUrl: string;
  elementSelector?: string;
  duration?: number;
}

export interface UserJourneyStep {
  stepNumber: number;
  pageUrl: string;
  entryTime: Date;
  exitTime: Date | null;
  duration: number;
  interactions: UserInteraction[];
}

export interface UserInteraction {
  type: string;
  timestamp: Date;
  elementSelector?: string;
  elementText?: string;
}