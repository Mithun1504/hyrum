import { z } from "zod";

export const onboardingProgressSchema = z.object({
  apiServiceId: z.uuid(),
  currentStep: z.string().min(1),
  completedSteps: z.array(z.string()),
  dismissedSteps: z.array(z.string()),
  lastErrorCode: z.string().nullable(),
  completedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type OnboardingProgress = z.infer<typeof onboardingProgressSchema>;
