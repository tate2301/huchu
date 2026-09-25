/**
 * Start and stop the local development stack: Postgres in Docker, the Next
 * server on the host.
 *
 *   pnpm dev:up               database, then `next dev` in this terminal
 *   pnpm dev:up --detach      the same, with the server in the background
 *   pnpm dev:down             kill the server, stop the database
 *   pnpm dev:down --wipe      ...and delete the database volume
 *   pnpm dev:status           what is currently up
 *
 * ## Why the server is killed by port and not only by pidfile
 *
 * The server people need killed is usually not the one this script started —
 * it is the `pnpm dev` from an hour ago that is still holding 3000, which is
 * why the new one silently moved to 3001 and why nothing they change shows up.
 * A pidfile knows nothing about that process. The port does, so `down` asks
 * the port who is listening and checks it belongs to this repo before killing
 * it, and the pidfile is only a second source for a detached server that ended
 * up somewhere else.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PID_FILE = resolve(ROOT, ".dev-server.pid");
const LOG_FILE = resolve(ROOT, ".dev-server.log");

const [command = "up", ...flags] = process.argv.slice(2);
const has = (flag) => flags.includes(flag);

/** Values from `.env`, which is the file `next dev` itself will read. */
function env() {
  const file = resolve(ROOT, ".env");
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return values;
}

const devPort = () => process.env.PORT ?? env().PORT ?? "3000";

/**
 * Where to actually point a browser.
 *
 * Not hardcoded to localhost: with PLATFORM_ROOT_DOMAIN set, localhost is the
 * *admin* portal in development (`isAdminPortalHost` returns true for any
 * loopback host outside production), and the tenant workspace only answers on
 * a tenant subdomain. Printing `localhost:3000/login` there sends you to the
 * wrong product.
 */
function signInUrls() {
  const values = env();
  const port = devPort();
  const lines = [];

  const workspace = values.NEXTAUTH_URL?.trim() || `http://localhost:${port}`;
  lines.push(`  workspace: ${workspace}/login`);

  if (values.ADMIN_ROOT_DOMAIN?.trim()) {
    lines.push(`  admin:     http://${values.ADMIN_ROOT_DOMAIN.trim()}:${port}/admin/login`);
  }

  return lines;
}

function compose(args, options = {}) {
  return spawnSync("docker", ["compose", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
}

function dockerRunning() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function requireDocker() {
  if (dockerRunning()) return;
  console.error(
    "Docker is not running. Start Docker Desktop (`open -a Docker`) and try again.",
  );
  process.exit(1);
}

/** PIDs listening on a TCP port, newest last. Empty when the port is free. */
function listenersOn(port) {
  const result = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  return (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(Number);
}

function commandOf(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  return (result.stdout ?? "").trim();
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Terminate a process politely, then not. Returns false if it outlived both.
 */
function stop(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return true;
  }
  // `next dev` shuts its workers down in well under a second; give it two.
  const deadline = Date.now() + 2000;
  const idle = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    Atomics.wait(idle, 0, 0, 100);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  return !alive(pid);
}

function up() {
  if (!existsSync(resolve(ROOT, ".env"))) {
    console.error("No .env — copy .env.example to .env first (see README).");
    process.exit(1);
  }

  requireDocker();

  console.log("Starting Postgres...");
  // --wait blocks on the healthcheck in docker-compose.yml, so by the time this
  // returns the database is accepting queries, not merely the port.
  const started = compose(["up", "-d", "--wait"]);
  if (started.status !== 0) process.exit(started.status ?? 1);

  // A fresh clone has no generated client, and `next dev` fails on the first
  // request rather than at boot, which reads as an application bug.
  //
  // Asked by requiring it rather than by looking for the generated file: under
  // pnpm that file lives inside a hashed `.pnpm` directory, so a path check
  // here answered "missing" every time and paid 16 seconds to regenerate a
  // client that was already there.
  const clientReady =
    spawnSync(process.execPath, ["-e", "require('@prisma/client')"], {
      cwd: ROOT,
      stdio: "ignore",
    }).status === 0;
  if (!clientReady) {
    console.log("Generating Prisma Client...");
    const generated = spawnSync("pnpm", ["db:generate"], { cwd: ROOT, stdio: "inherit" });
    if (generated.status !== 0) process.exit(generated.status ?? 1);
  }

  const port = devPort();
  const squatters = listenersOn(port);
  if (squatters.length > 0) {
    console.error(
      `Port ${port} is already taken by PID ${squatters.join(", ")}:\n` +
        squatters.map((pid) => `  ${commandOf(pid)}`).join("\n") +
        `\nRun \`pnpm dev:down\` to clear it.`,
    );
    process.exit(1);
  }

  if (has("--detach")) {
    const log = openSync(LOG_FILE, "a");
    const server = spawn("pnpm", ["dev"], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", log, log],
    });
    server.unref();
    writeFileSync(PID_FILE, String(server.pid));
    console.log(`Next dev server started in the background (PID ${server.pid}).`);
    for (const line of signInUrls()) console.log(line);
    console.log(`  logs:      tail -f .dev-server.log`);
    console.log(`  stop:      pnpm dev:down`);
    return;
  }

  console.log("\nNext dev server — Ctrl-C stops it.");
  for (const line of signInUrls()) console.log(line);
  console.log("\nThe database keeps running; `pnpm dev:down` stops that too.\n");
  const server = spawn("pnpm", ["dev"], { cwd: ROOT, stdio: "inherit" });
  server.on("exit", (code) => process.exit(code ?? 0));
}

function down() {
  const port = devPort();
  const killed = [];

  for (const pid of listenersOn(port)) {
    const command = commandOf(pid);
    // Only ours. Something else on 3000 is someone else's afternoon.
    if (!command.includes(ROOT) && !/\bnext(-server)?\b/.test(command)) {
      console.log(`Leaving PID ${pid} on port ${port} alone — not this repo:\n  ${command}`);
      continue;
    }
    if (stop(pid)) killed.push(pid);
    else console.error(`PID ${pid} would not die. Kill it by hand: kill -9 ${pid}`);
  }

  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, "utf8").trim());
    if (pid && alive(pid) && !killed.includes(pid) && stop(pid)) killed.push(pid);
    unlinkSync(PID_FILE);
  }

  console.log(
    killed.length > 0
      ? `Stopped the Next server (PID ${killed.join(", ")}).`
      : "No Next server was running.",
  );

  if (!dockerRunning()) {
    console.log("Docker is not running, so neither is the database.");
    return;
  }
  if (has("--wipe")) {
    console.log("Stopping Postgres and deleting its volume — all local data goes.");
    compose(["down", "--volumes"]);
  } else {
    compose(["down"]);
  }
}

function status() {
  if (dockerRunning()) compose(["ps"]);
  else console.log("Docker is not running, so neither is the database.");

  const port = devPort();
  const listeners = listenersOn(port);
  console.log("");
  if (listeners.length === 0) {
    console.log(`Next server: not running (port ${port} is free).`);
    return;
  }
  for (const pid of listeners) {
    console.log(`Next server: PID ${pid} on http://localhost:${port}\n  ${commandOf(pid)}`);
  }
}

switch (command) {
  case "up":
    up();
    break;
  case "down":
    down();
    break;
  case "status":
    status();
    break;
  default:
    console.error(`Unknown command "${command}". Use up, down or status.`);
    process.exit(1);
}
