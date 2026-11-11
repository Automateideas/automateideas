// Landing page only. Rendered as a <style> by LandingPage: this project sends every .css
// file through the Tailwind loader, which dropped these rules, so they live here instead.
// Every class and keyframe starts with ai-landing- so nothing in the app can collide.
export const LANDING_CSS = `
.ai-landing-status {
  display: inline-grid;
}
.ai-landing-status > * {
  grid-area: 1 / 1;
  opacity: 0;
  animation: ai-landing-status 9s infinite;
}
.ai-landing-status > :nth-child(2) {
  animation-delay: 3s;
}
.ai-landing-status > :nth-child(3) {
  animation-delay: 6s;
}
@keyframes ai-landing-status {
  0%,
  30% {
    opacity: 1;
  }
  34%,
  100% {
    opacity: 0;
  }
}

/* Restart on hover, as the card loops do elsewhere in the app. */
.ai-landing-frame:hover .ai-landing-status > * {
  animation-name: ai-landing-status-hover;
}
@keyframes ai-landing-status-hover {
  0%,
  30% {
    opacity: 1;
  }
  34%,
  100% {
    opacity: 0;
  }
}

/* The Paid row's total gets a green sweep while its status shows. */
.ai-landing-paid-bar {
  transform-origin: left;
  animation: ai-landing-paid-bar 9s infinite;
}
@keyframes ai-landing-paid-bar {
  0%,
  66% {
    transform: scaleX(0);
  }
  76%,
  97% {
    transform: scaleX(1);
  }
  100% {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-landing-status > *,
  .ai-landing-paid-bar {
    animation: none;
  }
  /* At rest the invoice reads as sent. */
  .ai-landing-status > :nth-child(2) {
    opacity: 1;
  }
  .ai-landing-paid-bar {
    transform: scaleX(0);
  }
}
`;
