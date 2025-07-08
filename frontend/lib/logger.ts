import log from "loglevel";

// Configure default log level based on environment
if (process.env.NODE_ENV === "production") {
  log.setLevel(log.levels.WARN);
} else {
  // Development/testing
  log.setLevel(log.levels.TRACE);
}

export default log;
