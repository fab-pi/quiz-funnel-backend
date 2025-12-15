/**
 * Subscription Plans Configuration
 * Defines the three pricing tiers for Shopify app
 */

export interface PlanFeatures {
  facebookPixel: boolean;
  conversionAPI: boolean;
}

export interface Plan {
  id: string;
  name: string;
  price: number; // EUR
  trialDays: number;
  maxSessions: number | null; // null = unlimited
  maxQuizzes: number | null; // null = unlimited
  features: PlanFeatures;
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29.99,
    trialDays: 7,
    maxSessions: 1000,
    maxQuizzes: 1,
    features: {
      facebookPixel: false,
      conversionAPI: false,
    },
  },
  {
    id: 'advanced',
    name: 'Advanced',
    price: 69.99,
    trialDays: 7,
    maxSessions: 10000,
    maxQuizzes: 3,
    features: {
      facebookPixel: true,
      conversionAPI: true,
    },
  },
  {
    id: 'scaling',
    name: 'Scaling',
    price: 149.99,
    trialDays: 7,
    maxSessions: null, // unlimited
    maxQuizzes: null, // unlimited
    features: {
      facebookPixel: true,
      conversionAPI: true,
    },
  },
];

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId);
}

/**
 * Get next plan (for upgrades)
 */
export function getNextPlan(currentPlanId: string): Plan | null {
  const planOrder = ['starter', 'advanced', 'scaling'];
  const currentIndex = planOrder.indexOf(currentPlanId);
  
  if (currentIndex === -1 || currentIndex === planOrder.length - 1) {
    return null; // No next plan
  }
  
  return getPlanById(planOrder[currentIndex + 1]) || null;
}

/**
 * Get previous plan (for downgrades)
 */
export function getPreviousPlan(currentPlanId: string): Plan | null {
  const planOrder = ['starter', 'advanced', 'scaling'];
  const currentIndex = planOrder.indexOf(currentPlanId);
  
  if (currentIndex <= 0) {
    return null; // No previous plan
  }
  
  return getPlanById(planOrder[currentIndex - 1]) || null;
}

