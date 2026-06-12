import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation";

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "bambi-app-web",
});

export const { register, onRequestError } = createInstrumentation({
  service: "bambi-app-web",
});
