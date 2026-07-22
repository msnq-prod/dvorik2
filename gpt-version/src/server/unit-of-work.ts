import { DatabaseError, type DatabaseAdapter, type DatabaseContext } from "./database";

export type UnitOfWorkContext<Repositories> = Readonly<{
  database: DatabaseContext;
  repositories: Repositories;
}>;

export type RepositoryFactory<Repositories> = (database: DatabaseContext) => Repositories;

/** Owns the transaction boundary; nested services receive the existing context. */
export class UnitOfWork<Repositories> {
  private active = false;

  constructor(
    private readonly database: DatabaseAdapter,
    private readonly createRepositories: RepositoryFactory<Repositories>
  ) {}

  transaction<T>(
    run: (context: UnitOfWorkContext<Repositories>) => T,
    options: Readonly<{ mode?: "deferred" | "immediate" }> = {}
  ): T {
    if (this.active) throw new DatabaseError("transaction", "NESTED_TRANSACTION_FORBIDDEN");
    this.active = true;
    try {
      return this.database.transaction((database) => run(Object.freeze({
        database,
        repositories: this.createRepositories(database)
      })), options);
    } finally {
      this.active = false;
    }
  }
}
