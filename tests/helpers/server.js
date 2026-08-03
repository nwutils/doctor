import http from "node:http";

/**
 * Start a throwaway HTTP server for a single test.
 * @param   {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void} handler
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);

    server.on("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        close: () => new Promise((res) => server.close(() => res())),
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}
