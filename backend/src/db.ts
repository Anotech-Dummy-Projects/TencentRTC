import pkg from "@prisma/client";

const { PrismaClient } = pkg;

// ─── Colour helpers (no extra deps) ──────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  magenta:"\x1b[35m",
};

const tag = (color: string, label: string) =>
  `${color}${c.bold}[${label}]${c.reset}`;

// ─── Prisma client (log levels controlled by NODE_ENV) ───────────────────────
export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? [
          { emit: "event", level: "query" },
          { emit: "event", level: "warn" },
          { emit: "event", level: "error" },
        ]
      : [{ emit: "event", level: "error" }],
});

// Forward Prisma events to console
(prisma as any).$on("query", (e: any) => {
  if (process.env.DB_QUERY_LOG === "true") {
    console.log(
      `${tag(c.dim, "QUERY")} ${c.dim}${e.query}${c.reset}  ${c.cyan}+${e.duration}ms${c.reset}`
    );
  }
});

(prisma as any).$on("warn", (e: any) => {
  console.warn(`${tag(c.yellow, "PRISMA WARN")} ${e.message}`);
});

(prisma as any).$on("error", (e: any) => {
  console.error(`${tag(c.red, "PRISMA ERROR")} ${e.message}`);
});

// ─── Mask the password in the DB URL for safe logging ────────────────────────
function maskDbUrl(url: string | undefined): string {
  if (!url) return "(DATABASE_URL not set)";
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "****";
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ":****@");
  }
}

// ─── connectDB — call once at server startup ──────────────────────────────────
export async function connectDB(): Promise<void> {
  const dbUrl = maskDbUrl(process.env.DATABASE_URL);
  console.log(`\n${tag(c.cyan, "DB")} Connecting to database…`);
  console.log(`${tag(c.cyan, "DB")} ${c.dim}${dbUrl}${c.reset}`);

  const start = Date.now();
  try {
    await prisma.$connect();
    const ms = Date.now() - start;
    console.log(
      `${tag(c.green, "DB")} ${c.green}${c.bold}Connected successfully${c.reset} ${c.dim}(${ms}ms)${c.reset}\n`
    );
  } catch (err: any) {
    const ms = Date.now() - start;
    console.error(
      `${tag(c.red, "DB")} ${c.red}${c.bold}Connection FAILED${c.reset} ${c.dim}(${ms}ms)${c.reset}`
    );
    console.error(`${tag(c.red, "DB")} ${err?.message ?? err}`);
    process.exit(1); // Hard-stop — no point running without a DB
  }
}
