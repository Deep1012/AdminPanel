/**
 * Terminal Express error handler. Mounted last in server.js, after every
 * router, so it sees anything a handler passes to `next(error)` plus anything
 * Express catches on its own (a synchronous throw in a router, a malformed
 * JSON body from express.json, an oversized payload).
 *
 * Responsibilities, in order:
 *   1. Log the whole error server-side — message, stack, and the request that
 *      produced it. This is the durable record the old inline
 *      `res.status(500).json({ detail: error.message })` never produced.
 *   2. Answer with a client-safe body: deliberate 4xx `{ detail }` messages
 *      pass through verbatim, unexpected failures collapse to one generic
 *      sentence (see lib/errorResponse.js for the reasoning).
 *
 * NO EXTERNAL ERROR TRACKER IS WIRED UP. Sentry and friends need an account
 * and a DSN this project does not have. Instead `reporter` is a seam: pass a
 * function and it is called with (error, context) for every 5xx, so adding
 * Sentry later is
 *
 *   const Sentry = require("@sentry/node");
 *   Sentry.init({ dsn: process.env.SENTRY_DSN });
 *   app.use(createErrorHandler({ reporter: (err, ctx) => Sentry.captureException(err, { extra: ctx }) }));
 *
 * and nothing in the handler or the routes changes. A throwing reporter is
 * swallowed: a broken tracker must never turn a 500 into a hung request.
 */

const { toErrorResponse } = require("../lib/errorResponse");

/**
 * The subset of the request worth recording. Deliberately excludes the body,
 * headers and query string: login posts a password, and several endpoints
 * carry an Authorization bearer token.
 *
 * @param {import("express").Request} req
 * @returns {Object}
 */
function requestContext(req) {
  if (!req) return {};
  return {
    method: req.method,
    path: req.originalUrl || req.path,
    user_id: req.user ? req.user.id : null,
    ip: req.ip,
  };
}

/**
 * Build the terminal error handler.
 *
 * @param {Object} [options]
 * @param {(error: *, context: Object) => void} [options.reporter] - Optional
 *   external-tracker hook, called for 5xx only.
 * @param {{ error: Function }} [options.logger] - Defaults to console.
 * @returns {(error: *, req: *, res: *, next: Function) => void}
 */
function createErrorHandler(options = {}) {
  const reporter = typeof options.reporter === "function" ? options.reporter : null;
  const logger = options.logger || console;

  return function errorHandler(error, req, res, next) {
    const { status, body } = toErrorResponse(error);
    const context = requestContext(req);

    if (status >= 500) {
      logger.error("[error]", {
        ...context,
        status,
        message: error && error.message,
        name: error && error.name,
        code: error && error.code,
        stack: error && error.stack,
      });

      if (reporter) {
        try {
          reporter(error, { ...context, status });
        } catch (reporterError) {
          logger.error("[error] reporter threw", { message: reporterError && reporterError.message });
        }
      }
    }

    // Something already started streaming a response; Express's default
    // handler is the only thing that can tidy that up.
    if (res && res.headersSent) {
      return next(error);
    }

    res.status(status).json(body);
  };
}

module.exports = { createErrorHandler, requestContext };
