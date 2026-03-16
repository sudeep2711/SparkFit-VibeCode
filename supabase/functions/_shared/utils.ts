import type { DayPlan } from './types.ts';

/** Normalise plan_data — handles both flat array and legacy { week_plan: [...] } format */
export function normalizePlan(planData: unknown): DayPlan[] {
  if (Array.isArray(planData)) return planData as DayPlan[];
  if (planData && typeof planData === 'object') {
    const d = planData as Record<string, unknown>;
    if (Array.isArray(d.week_plan)) return d.week_plan as DayPlan[];
  }
  return [];
}

/** Find today's plan — handles both "Monday" and "Day 1" naming */
export function findTodayPlan(plan: DayPlan[]): DayPlan | undefined {
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }); // e.g. "Monday"
  const byName = plan.find((d) => d.day.toLowerCase() === todayName.toLowerCase());
  if (byName) return byName;
  // Fallback: weekday index (Mon=0…Sun=6) mapped to plan array index
  const jsDay = new Date().getDay(); // 0=Sun, 1=Mon … 6=Sat
  const planIndex = jsDay === 0 ? 6 : jsDay - 1;
  return plan[planIndex];
}
