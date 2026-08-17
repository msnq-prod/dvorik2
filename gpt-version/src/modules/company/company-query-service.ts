import type { CompanyOverview, CompanyProductProfitability, CompanyProjectionService, CompanyStatus } from "./company-projection-service";

export class CompanyQueryService {
  constructor(private readonly projections: Pick<CompanyProjectionService, "productProfitability"|"overview"|"status">) {}

  productProfitability(productId: string): CompanyProductProfitability | undefined {
    return this.projections.productProfitability(productId);
  }

  overview(): CompanyOverview { return this.projections.overview(); }
  status(): CompanyStatus { return this.projections.status(); }
}
