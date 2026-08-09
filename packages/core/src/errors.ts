export class DomainError extends Error {
  public constructor(
    public readonly code:
      | "forbidden"
      | "not_found"
      | "conflict"
      | "validation"
      | "invalid_state",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
