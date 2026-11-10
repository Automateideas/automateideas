"use client";

import { MotionConfig } from "motion/react";

// Production respects the OS "reduce motion" setting; development always
// animates so you can see the animations while building.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion={process.env.NODE_ENV === "production" ? "user" : "never"}
    >
      {children}
    </MotionConfig>
  );
}
