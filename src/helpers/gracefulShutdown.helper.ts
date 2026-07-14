type Signal = "SIGINT" | "SIGTERM";

const FORCE_EXIT_TIMEOUT_MS = 10_000;

export const registerGracefulShutdown = (
  onShutdown: (signal: Signal) => Promise<void>,
) => {
  let shuttingDown = false;

  const handler = async (signal: Signal) => {
    if (shuttingDown) {
      console.warn(`Received ${signal} again — forcing exit.`);
      process.exit(1);
    }

    shuttingDown = true;
    console.log(`Received ${signal} — shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      console.warn(
        `Graceful shutdown exceeded ${FORCE_EXIT_TIMEOUT_MS}ms — forcing exit.`,
      );
      process.exit(1);
    }, FORCE_EXIT_TIMEOUT_MS);
    forceExit.unref();

    try {
      await onShutdown(signal);
      process.exit(0);
    } catch (error) {
      console.error("Error during graceful shutdown", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
};
