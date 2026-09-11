const { GENERIC_DETAIL, errorStatus, isClientSafe, toErrorResponse } = require("../errorResponse");
const { createErrorHandler, requestContext } = require("../../middleware/errorHandler");

/** An error carrying an explicit HTTP status, the http-errors convention. */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** Minimal Express response double: records status and body. */
function fakeRes({ headersSent = false } = {}) {
  const sent = { status: null, body: null };
  return {
    headersSent,
    sent,
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    },
  };
}

/** Minimal Express request double. */
function fakeReq(overrides = {}) {
  return {
    method: "POST",
    originalUrl: "/api/production",
    ip: "203.0.113.7",
    user: { id: "u-1", username: "operator" },
    headers: { authorization: "Bearer secret-token" },
    body: { password: "hunter2" },
    ...overrides,
  };
}

/** Logger double. */
function fakeLogger() {
  const errors = [];
  return { errors, error: (...args) => errors.push(args) };
}

describe("errorStatus", () => {
  it("defaults to 500", () => {
    expect(errorStatus(new Error("boom"))).toBe(500);
    expect(errorStatus(null)).toBe(500);
    expect(errorStatus(undefined)).toBe(500);
  });

  it("honours an explicit status", () => {
    expect(errorStatus(httpError(404, "Brand not found"))).toBe(404);
  });

  it("honours statusCode as well as status", () => {
    const error = new Error("nope");
    error.statusCode = 409;
    expect(errorStatus(error)).toBe(409);
  });

  it("reads the 400 that express.json attaches to a malformed body", () => {
    const parseError = new SyntaxError("Unexpected token } in JSON at position 17");
    parseError.status = 400;
    parseError.type = "entity.parse.failed";
    expect(errorStatus(parseError)).toBe(400);
  });

  it("reads the 413 that express.json attaches to an oversized body", () => {
    const tooLarge = httpError(413, "request entity too large");
    expect(errorStatus(tooLarge)).toBe(413);
  });

  it("ignores a nonsense status rather than emitting an invalid response code", () => {
    const error = new Error("x");
    error.status = 0;
    expect(errorStatus(error)).toBe(500);

    const other = new Error("x");
    other.status = 99999;
    expect(errorStatus(other)).toBe(500);

    const stringy = new Error("x");
    stringy.status = "not-a-number";
    expect(errorStatus(stringy)).toBe(500);
  });
});

describe("isClientSafe", () => {
  it("treats 4xx as safe to show", () => {
    expect(isClientSafe(httpError(400, "bad"))).toBe(true);
    expect(isClientSafe(httpError(404, "missing"))).toBe(true);
    expect(isClientSafe(httpError(429, "slow down"))).toBe(true);
  });

  it("treats 5xx as unsafe", () => {
    expect(isClientSafe(httpError(500, "internal"))).toBe(false);
    expect(isClientSafe(httpError(503, "unavailable"))).toBe(false);
    expect(isClientSafe(new Error("undefined is not a function"))).toBe(false);
  });

  it("honours an explicit expose flag either way", () => {
    const exposed = httpError(500, "deliberately public");
    exposed.expose = true;
    expect(isClientSafe(exposed)).toBe(true);

    const hidden = httpError(400, "deliberately private");
    hidden.expose = false;
    expect(isClientSafe(hidden)).toBe(false);
  });
});

describe("toErrorResponse - preserving deliberate 4xx messages", () => {
  it("passes a 400 message through verbatim, because the frontend renders it", () => {
    expect(toErrorResponse(httpError(400, "Quantity must be greater than zero"))).toEqual({
      status: 400,
      body: { detail: "Quantity must be greater than zero" },
    });
  });

  it("preserves the domain rejections this CRM depends on", () => {
    const cases = [
      [400, "Dispatch quantity exceeds remaining PO quantity"],
      [400, "PO quantity cannot be reduced below the already-dispatched amount"],
      [400, "Cannot delete raw material: printing jobs reference it"],
      [404, "Purchase order not found"],
      [409, "serial_no already exists"],
      [429, "Too many failed login attempts. Try again in 15 minutes."],
    ];

    for (const [status, detail] of cases) {
      expect(toErrorResponse(httpError(status, detail))).toEqual({ status, body: { detail } });
    }
  });

  it("keeps the { detail } envelope for every case", () => {
    for (const error of [httpError(400, "bad"), new Error("boom"), null]) {
      expect(Object.keys(toErrorResponse(error).body)).toEqual(["detail"]);
    }
  });
});

describe("toErrorResponse - genericising unexpected failures", () => {
  it("replaces a bare Error message", () => {
    expect(toErrorResponse(new Error("Cannot read properties of undefined"))).toEqual({
      status: 500,
      body: { detail: GENERIC_DETAIL },
    });
  });

  it("does not leak Mongoose or driver internals", () => {
    const leaky = [
      'E11000 duplicate key error collection: timestin_crm.users index: email_1 dup key: { email: "a@b.com" }',
      "Cast to ObjectId failed for value \"abc\" (type string) at path \"_id\" for model \"Production\"",
      "connect ECONNREFUSED ac-xyz-shard-00-01.abcde.mongodb.net:27017",
      "Production validation failed: quantity_produced: Path `quantity_produced` is required.",
    ];

    for (const message of leaky) {
      const { status, body } = toErrorResponse(new Error(message));
      expect(status).toBe(500);
      expect(body.detail).toBe(GENERIC_DETAIL);
      expect(body.detail).not.toContain("mongodb");
      expect(body.detail).not.toContain("timestin_crm");
      expect(body.detail).not.toContain("ObjectId");
    }
  });

  it("genericises a 5xx that carries an explicit status too", () => {
    expect(toErrorResponse(httpError(503, "replica set primary stepped down")).body.detail)
      .toBe(GENERIC_DETAIL);
  });

  it("survives a thrown non-Error", () => {
    expect(toErrorResponse("just a string")).toEqual({ status: 500, body: { detail: GENERIC_DETAIL } });
    expect(toErrorResponse(null)).toEqual({ status: 500, body: { detail: GENERIC_DETAIL } });
    expect(toErrorResponse({})).toEqual({ status: 500, body: { detail: GENERIC_DETAIL } });
  });

  it("falls back to the generic message for a 4xx with an empty message", () => {
    expect(toErrorResponse(httpError(400, "")).body.detail).toBe(GENERIC_DETAIL);
    expect(toErrorResponse(httpError(400, "   ")).body.detail).toBe(GENERIC_DETAIL);
  });

  it("the generic message says nothing about the failure", () => {
    expect(GENERIC_DETAIL).not.toMatch(/mongo|mongoose|stack|undefined|null/i);
  });
});

describe("createErrorHandler", () => {
  it("has the four-argument signature Express requires of an error handler", () => {
    expect(createErrorHandler()).toHaveLength(4);
  });

  it("sends the classified status and body", () => {
    const res = fakeRes();
    createErrorHandler({ logger: fakeLogger() })(httpError(404, "Brand not found"), fakeReq(), res, () => {});
    expect(res.sent).toEqual({ status: 404, body: { detail: "Brand not found" } });
  });

  it("logs the full error, including the stack, for a 5xx", () => {
    const logger = fakeLogger();
    const error = new Error("Cannot read properties of undefined");
    createErrorHandler({ logger })(error, fakeReq(), fakeRes(), () => {});

    expect(logger.errors).toHaveLength(1);
    const [, logged] = logger.errors[0];
    expect(logged.message).toBe("Cannot read properties of undefined");
    expect(logged.stack).toBe(error.stack);
    expect(logged.status).toBe(500);
    expect(logged.method).toBe("POST");
    expect(logged.path).toBe("/api/production");
    expect(logged.user_id).toBe("u-1");
  });

  it("does not log deliberate 4xx rejections as server errors", () => {
    const logger = fakeLogger();
    createErrorHandler({ logger })(httpError(400, "Quantity must be positive"), fakeReq(), fakeRes(), () => {});
    expect(logger.errors).toHaveLength(0);
  });

  it("never logs the request body or headers, which carry passwords and bearer tokens", () => {
    const logger = fakeLogger();
    createErrorHandler({ logger })(new Error("boom"), fakeReq(), fakeRes(), () => {});

    const serialised = JSON.stringify(logger.errors);
    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("secret-token");
  });

  it("calls an injected reporter for a 5xx - the seam an external tracker would use", () => {
    const reported = [];
    const error = new Error("boom");
    createErrorHandler({ logger: fakeLogger(), reporter: (e, ctx) => reported.push([e, ctx]) })(
      error, fakeReq(), fakeRes(), () => {}
    );

    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toBe(error);
    expect(reported[0][1].path).toBe("/api/production");
  });

  it("does not call the reporter for a 4xx", () => {
    const reported = [];
    createErrorHandler({ logger: fakeLogger(), reporter: (e) => reported.push(e) })(
      httpError(400, "bad"), fakeReq(), fakeRes(), () => {}
    );
    expect(reported).toHaveLength(0);
  });

  it("still answers when the reporter throws, so a broken tracker cannot hang a request", () => {
    const res = fakeRes();
    const logger = fakeLogger();
    const handler = createErrorHandler({
      logger,
      reporter: () => {
        throw new Error("tracker down");
      },
    });

    expect(() => handler(new Error("boom"), fakeReq(), res, () => {})).not.toThrow();
    expect(res.sent.status).toBe(500);
    expect(res.sent.body).toEqual({ detail: GENERIC_DETAIL });
  });

  it("ignores a non-function reporter", () => {
    const res = fakeRes();
    createErrorHandler({ logger: fakeLogger(), reporter: "sentry" })(new Error("boom"), fakeReq(), res, () => {});
    expect(res.sent.status).toBe(500);
  });

  it("delegates to Express when the response has already started streaming", () => {
    const res = fakeRes({ headersSent: true });
    const forwarded = [];
    const error = new Error("boom");

    createErrorHandler({ logger: fakeLogger() })(error, fakeReq(), res, (e) => forwarded.push(e));

    expect(forwarded).toEqual([error]);
    expect(res.sent).toEqual({ status: null, body: null });
  });

  it("works with no options at all", () => {
    const res = fakeRes();
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      createErrorHandler()(new Error("boom"), fakeReq(), res, () => {});
    } finally {
      spy.mockRestore();
    }
    expect(res.sent.status).toBe(500);
  });
});

describe("requestContext", () => {
  it("records only the safe request fields", () => {
    expect(requestContext(fakeReq())).toEqual({
      method: "POST",
      path: "/api/production",
      user_id: "u-1",
      ip: "203.0.113.7",
    });
  });

  it("handles an unauthenticated request", () => {
    expect(requestContext(fakeReq({ user: undefined })).user_id).toBeNull();
  });

  it("falls back to path when originalUrl is absent", () => {
    const context = requestContext({ method: "GET", path: "/api/health" });
    expect(context.path).toBe("/api/health");
  });

  it("survives a missing request", () => {
    expect(requestContext(undefined)).toEqual({});
  });
});
