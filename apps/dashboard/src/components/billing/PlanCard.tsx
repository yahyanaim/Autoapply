import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PublicPricingPlan } from '@/lib/pricing';

export function PlanCard({
  plan,
  disabled,
  buttonLabel,
  onSelect,
}: {
  plan: PublicPricingPlan;
  disabled: boolean;
  buttonLabel: string;
  onSelect: () => void;
}) {
  const primaryFeatures = plan.currentFeatures.slice(0, 6);
  const additionalFeatures = plan.currentFeatures.slice(6);
  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
      <p className="mt-2">
        <span className="text-3xl font-bold">{plan.price}</span>
        <span className="text-sm text-gray-500">/month</span>
      </p>
      <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
      <ul className="my-5 space-y-2 text-sm text-gray-600">
        {primaryFeatures.map((feature) => (
          <li key={feature}>✓ {feature}</li>
        ))}
      </ul>
      {additionalFeatures.length > 0 && (
        <details className="mb-5 border-t border-gray-100 pt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-primary-600">
            More included features
          </summary>
          <ul className="mt-3 space-y-2 text-gray-600">
            {additionalFeatures.map((feature) => (
              <li key={feature}>✓ {feature}</li>
            ))}
          </ul>
        </details>
      )}
      <Button className="w-full" onClick={onSelect} disabled={disabled}>
        {checkoutLabel(disabled, buttonLabel)}
      </Button>
    </Card>
  );
}

function checkoutLabel(disabled: boolean, label: string) {
  if (!disabled) return label;
  return label === 'Current plan' ? label : 'Processing…';
}
