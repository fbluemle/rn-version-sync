// Preloaded into the CLI process by cli.test.ts. Answers fetch from the
// STUB_FETCH map of "METHOD url" to JSON bodies; any other request gets a
// 404.
const routes = JSON.parse(process.env.STUB_FETCH);

globalThis.fetch = async (url, init = {}) => {
  const request = `${init.method ?? 'GET'} ${url}`;
  return request in routes
    ? new Response(JSON.stringify(routes[request]))
    : new Response(`No stub for ${request}`, { status: 404 });
};
