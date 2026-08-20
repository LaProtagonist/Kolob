type JourneyAction = {
  href: string;
  label: string;
  tone: "primary" | "secondary";
  testId: string;
  onNavigate?: () => void;
};

export function InvestorJourneyNavigation({ actions }: { actions: JourneyAction[] }) {
  return (
    <nav className="investor-journey-navigation" aria-label="Маршрут инвестора">
      {actions.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className={`is-${action.tone}`}
          data-testid={action.testId}
          onClick={action.onNavigate}
        >
          {action.label}
        </a>
      ))}
    </nav>
  );
}
