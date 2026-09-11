/**
 * Run a route's FULL middleware chain, in order, the way Express would.
 *
 * The production.get test calls only the final handler with authenticate
 * mocked to pass through — fine for testing a response shape, useless for
 * proving that a guard exists. Security tests must let the REAL authenticate
 * and adminRequired run, so this walks every layer and stops as soon as one
 * responds instead of calling next().
 *
 * No supertest dependency: the project has none, and this is enough to drive
 * handlers that use only req.headers/body/params/query and res.status/json.
 */

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    type() {
      return this;
    },
  };
}

/** Find the layer for `method path` on an express.Router. */
function findRoute(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No route ${method} ${path}`);
  return layer.route;
}

/**
 * @returns {Promise<ReturnType<typeof fakeRes> & { reachedHandler: boolean }>}
 */
async function runRoute(router, method, path, { headers = {}, body = {}, params = {}, query = {} } = {}) {
  const route = findRoute(router, method, path);
  const stack = route.stack.filter((l) => l.method === undefined || l.method === method.toLowerCase());
  const req = { method: method.toUpperCase(), headers, body, params, query, ip: "127.0.0.1" };
  const res = fakeRes();
  let reachedHandler = false;

  for (let i = 0; i < stack.length; i += 1) {
    const isLast = i === stack.length - 1;
    if (isLast) reachedHandler = true;

    let calledNext = false;
    let nextError;
    await stack[i].handle(req, res, (err) => {
      calledNext = true;
      nextError = err;
    });

    if (nextError) throw nextError;
    if (res.ended || !calledNext) break;
  }

  return Object.assign(res, { reachedHandler });
}

module.exports = { runRoute, findRoute, fakeRes };
