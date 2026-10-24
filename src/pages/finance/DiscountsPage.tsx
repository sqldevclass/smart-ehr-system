import DiscountsManager from "@/components/finance/DiscountsManager";
import InvoiceDiscountPanel from "@/components/finance/InvoiceDiscountPanel";

export default function DiscountsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">Discounts</h1>
      <DiscountsManager />
      <InvoiceDiscountPanel />
    </div>
  );
}