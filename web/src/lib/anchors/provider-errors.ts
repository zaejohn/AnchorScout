export class UnsupportedProviderRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedProviderRouteError";
  }
}
