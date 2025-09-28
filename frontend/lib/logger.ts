import log from "loglevel";

if (process.env.NODE_ENV === "production") {
  log.setLevel(log.levels.WARN);
} else {
  log.setLevel(log.levels.TRACE);
}

export default log;
