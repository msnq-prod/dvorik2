import type { ApplicationRepositories, UtcTimestamp } from "./repositories";
import { UnitOfWork, type UnitOfWorkContext } from "./unit-of-work";

export type CommandChannel = "web" | "telegram" | "worker";
export type CommandActor =
  | Readonly<{ kind: "user"; userId: string; authenticatedBy: "web_session" | "telegram_update" }>
  | Readonly<{ kind: "system"; service: string; authenticatedBy: "worker_registry" | "telegram_webhook" }>;

export type CommandActorResolver = Readonly<{
  resolve(actorReference: unknown, channel: CommandChannel): unknown;
}>;

export type CommandClock = Readonly<{ now(): UtcTimestamp }>;
export type CommandMetadata = Readonly<{
  actorReference: unknown;
  requestId: string;
  channel: CommandChannel;
  idempotencyKey: string;
}>;

export type CommandTransaction<Repositories> = Readonly<{ repositories: Repositories }>;
export type CommandContext<Repositories> = Readonly<{
  actor: CommandActor;
  requestId: string;
  correlationId: string;
  channel: CommandChannel;
  idempotencyKey: string;
  clock: CommandClock;
  transaction: CommandTransaction<Repositories>;
}>;
export type ApplicationCommandContext = CommandContext<ApplicationRepositories>;
export type CommandExecutionOptions = Readonly<{ transactionMode?: "deferred" | "immediate" }>;

export class CommandContextError extends Error {
  constructor(public readonly code: "BAD_ACTOR" | "BAD_REQUEST_ID" | "BAD_CHANNEL" | "BAD_IDEMPOTENCY_KEY" | "BAD_CLOCK") {
    super(`Invalid command context: ${code}`);
    this.name = "CommandContextError";
  }
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function identifier(value: unknown, code: "BAD_ACTOR" | "BAD_REQUEST_ID" | "BAD_IDEMPOTENCY_KEY", maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength || !identifierPattern.test(value)) throw new CommandContextError(code);
  return value;
}

function actor(value: unknown, channel: CommandChannel): CommandActor {
  if (!value || typeof value !== "object" || !("kind" in value)) throw new CommandContextError("BAD_ACTOR");
  const candidate = value as Partial<CommandActor>;
  if (candidate.kind === "user") {
    const authenticatedBy = candidate.authenticatedBy;
    if ((channel === "web" && authenticatedBy !== "web_session")
      || (channel === "telegram" && authenticatedBy !== "telegram_update")
      || channel === "worker") throw new CommandContextError("BAD_ACTOR");
    return Object.freeze({
      kind: "user",
      userId: identifier(candidate.userId, "BAD_ACTOR", 128),
      authenticatedBy: channel === "web" ? "web_session" : "telegram_update"
    });
  }
  if (candidate.kind === "system") {
    const authenticatedBy = candidate.authenticatedBy;
    if ((channel === "worker" && authenticatedBy !== "worker_registry")
      || (channel === "telegram" && authenticatedBy !== "telegram_webhook")
      || channel === "web") throw new CommandContextError("BAD_ACTOR");
    if (authenticatedBy !== "worker_registry" && authenticatedBy !== "telegram_webhook") throw new CommandContextError("BAD_ACTOR");
    return Object.freeze({
      kind: "system",
      service: identifier(candidate.service, "BAD_ACTOR", 128),
      authenticatedBy
    });
  }
  throw new CommandContextError("BAD_ACTOR");
}

function channel(value: CommandChannel) {
  if (value !== "web" && value !== "telegram" && value !== "worker") throw new CommandContextError("BAD_CHANNEL");
  return value;
}

function utc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new CommandContextError("BAD_CLOCK");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new CommandContextError("BAD_CLOCK");
  const canonicalInput = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (parsed.toISOString() !== canonicalInput) throw new CommandContextError("BAD_CLOCK");
  return canonicalInput;
}

function transactionFacade<Repositories>(context: UnitOfWorkContext<Repositories>): CommandTransaction<Repositories> {
  return Object.freeze({ repositories: context.repositories });
}

export class CommandExecutor<Repositories> {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly sourceClock: CommandClock,
    private readonly actorResolver: CommandActorResolver
  ) {}

  execute<T>(metadata: CommandMetadata, run: (context: CommandContext<Repositories>) => T, options: CommandExecutionOptions = {}): T {
    const requestId = identifier(metadata.requestId, "BAD_REQUEST_ID", 128);
    const safeChannel = channel(metadata.channel);
    const idempotencyKey = identifier(metadata.idempotencyKey, "BAD_IDEMPOTENCY_KEY", 256);
    let resolvedActor: unknown;
    try {
      resolvedActor = this.actorResolver.resolve(metadata.actorReference, safeChannel);
    } catch {
      throw new CommandContextError("BAD_ACTOR");
    }
    const safeActor = actor(resolvedActor, safeChannel);
    const clock = Object.freeze({ now: () => utc(this.sourceClock.now()) });
    clock.now();

    return this.unitOfWork.transaction((transaction) => run(Object.freeze({
      actor: safeActor,
      requestId,
      correlationId: requestId,
      channel: safeChannel,
      idempotencyKey,
      clock,
      transaction: transactionFacade(transaction)
    })), { mode: options.transactionMode });
  }
}
